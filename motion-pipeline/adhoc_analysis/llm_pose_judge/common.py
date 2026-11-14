"""Shared helpers: pose loading, overlay rendering, perturbations."""
import csv, math, random
import numpy as np, cv2

NAMES = ["NOSE","LEFT_EYE_INNER","LEFT_EYE","LEFT_EYE_OUTER","RIGHT_EYE_INNER","RIGHT_EYE","RIGHT_EYE_OUTER",
 "LEFT_EAR","RIGHT_EAR","MOUTH_LEFT","MOUTH_RIGHT","LEFT_SHOULDER","RIGHT_SHOULDER","LEFT_ELBOW","RIGHT_ELBOW",
 "LEFT_WRIST","RIGHT_WRIST","LEFT_PINKY","RIGHT_PINKY","LEFT_INDEX","RIGHT_INDEX","LEFT_THUMB","RIGHT_THUMB",
 "LEFT_HIP","RIGHT_HIP","LEFT_KNEE","RIGHT_KNEE","LEFT_ANKLE","RIGHT_ANKLE","LEFT_HEEL","RIGHT_HEEL",
 "LEFT_FOOT_INDEX","RIGHT_FOOT_INDEX"]
IDX = {n:i for i,n in enumerate(NAMES)}
# BlazePose connections
CONN = [(0,1),(1,2),(2,3),(3,7),(0,4),(4,5),(5,6),(6,8),(9,10),(11,12),(11,13),(13,15),(15,17),(15,19),(15,21),(17,19),
 (12,14),(14,16),(16,18),(16,20),(16,22),(18,20),(11,23),(12,24),(23,24),(23,25),(24,26),(25,27),(26,28),(27,29),(28,30),
 (29,31),(30,32),(27,31),(28,32)]
LEFT = {i for i,n in enumerate(NAMES) if n.startswith("LEFT") or n=="MOUTH_LEFT"}
RIGHT = {i for i,n in enumerate(NAMES) if n.startswith("RIGHT") or n=="MOUTH_RIGHT"}
KEY = [11,12,13,14,15,16,23,24,25,26,27,28]
# mirror permutation (left<->right)
MIRROR = list(range(33))
for i,n in enumerate(NAMES):
    if n.startswith("LEFT"): MIRROR[i]=IDX["RIGHT"+n[4:]]
    elif n.startswith("RIGHT"): MIRROR[i]=IDX["LEFT"+n[5:]]
MIRROR[9],MIRROR[10]=10,9
COL_L=(0,140,255)   # BGR orange  -> subject's LEFT
COL_R=(255,170,0)   # BGR blue    -> subject's RIGHT
COL_C=(255,255,255)

def load_pose(path):
    rows=list(csv.DictReader(open(path)))
    n=len(rows); P=np.full((n,33,2),np.nan); V=np.zeros((n,33))
    for r in rows:
        f=int(float(r["frame"]))
        if f>=n or r["NOSE_x"]=="": continue
        for i,nm in enumerate(NAMES):
            P[f,i]=[float(r[nm+"_x"]),float(r[nm+"_y"])]; V[f,i]=float(r[nm+"_vis"])
    return P,V

def torso(p):
    ms=(p[11]+p[12])/2; mh=(p[23]+p[24])/2
    return float(np.linalg.norm(ms-mh))

def read_frame(cap,f):
    cap.set(cv2.CAP_PROP_POS_FRAMES,f); ok,img=cap.read()
    return img if ok else None

def crop_box(p,W,H,margin=0.35):
    pts=p[~np.isnan(p).any(1)]
    x0,y0=pts.min(0); x1,y1=pts.max(0)
    w,h=x1-x0,y1-y0; s=max(w,h)*(1+2*margin)/1.0
    cx,cy=(x0+x1)/2,(y0+y1)/2
    bw=max(w*(1+2*margin), 0.6*h*(1+2*margin)); bh=h*(1+2*margin)
    bw=max(bw,bh*0.6)
    x0=int(max(0,cx-bw/2)); x1=int(min(W,cx+bw/2)); y0=int(max(0,cy-bh/2)); y1=int(min(H,cy+bh/2))
    return x0,y0,x1,y1

def draw(img,p,box,out_long=768,colors=None):
    """Draw skeleton p (pixel coords of full frame) on crop box; returns image."""
    x0,y0,x1,y1=box; c=img[y0:y1,x0:x1].copy()
    sc=out_long/max(c.shape[:2]); c=cv2.resize(c,(int(c.shape[1]*sc),int(c.shape[0]*sc)),interpolation=cv2.INTER_AREA)
    q=(p-np.array([x0,y0]))*sc
    th=max(2,int(round(out_long/250)))
    def col(i,j=None):
        s={i} if j is None else {i,j}
        if s<=LEFT: return COL_L
        if s<=RIGHT: return COL_R
        return COL_C
    for a,b in CONN:
        if np.isnan(q[[a,b]]).any(): continue
        pa=tuple(int(v) for v in q[a]); pb=tuple(int(v) for v in q[b])
        cv2.line(c,pa,pb,(0,0,0),th+2,cv2.LINE_AA); cv2.line(c,pa,pb,col(a,b),th,cv2.LINE_AA)
    for i in range(33):
        if np.isnan(q[i]).any(): continue
        pt=tuple(int(v) for v in q[i]); cv2.circle(c,pt,th+2,(0,0,0),-1,cv2.LINE_AA); cv2.circle(c,pt,th+1,col(i),-1,cv2.LINE_AA)
    return c

def raw_crop(img,box,out_long=768):
    x0,y0,x1,y1=box; c=img[y0:y1,x0:x1].copy()
    sc=out_long/max(c.shape[:2]); return cv2.resize(c,(int(c.shape[1]*sc),int(c.shape[0]*sc)),interpolation=cv2.INTER_AREA)

# ---- perturbations: each returns (new_pose, meta) or None if not applicable/too subtle
ARM_L=[13,15,17,19,21]; ARM_R=[14,16,18,20,22]
LEG_L=[25,27,29,31]; LEG_R=[26,28,30,32]
CHAINS={"LEFT_ELBOW":[13,15,17,19,21],"RIGHT_ELBOW":[14,16,18,20,22],"LEFT_WRIST":[15,17,19,21],"RIGHT_WRIST":[16,18,20,22],
        "LEFT_KNEE":[25,27,29,31],"RIGHT_KNEE":[26,28,30,32],"LEFT_ANKLE":[27,29,31],"RIGHT_ANKLE":[28,30,32]}
PARENT={"LEFT_ELBOW":11,"RIGHT_ELBOW":12,"LEFT_WRIST":13,"RIGHT_WRIST":14,"LEFT_KNEE":23,"RIGHT_KNEE":24,"LEFT_ANKLE":25,"RIGHT_ANKLE":26}

def swap_parts(p,A,B,T,minmove=0.5):
    q=p.copy(); q[A],q[B]=p[B],p[A]
    mv=np.nanmax(np.linalg.norm(q[A]-p[A],axis=1))
    if mv<minmove*T: return None
    return q,{"max_move_T":round(mv/T,2)}

def arm_swap(p,T,rng): return swap_parts(p,ARM_L,ARM_R,T)
def leg_swap(p,T,rng): return swap_parts(p,LEG_L,LEG_R,T)

def limb_rotate(p,T,rng):
    j=rng.choice(list(CHAINS)); par=PARENT[j]; ch=CHAINS[j]
    ang=math.radians(rng.choice([-1,1])*rng.uniform(70,130))
    R=np.array([[math.cos(ang),-math.sin(ang)],[math.sin(ang),math.cos(ang)]])
    q=p.copy(); q[ch]=(p[ch]-p[par])@R.T+p[par]
    mv=np.nanmax(np.linalg.norm(q[ch]-p[ch],axis=1))
    if mv<0.4*T: return None
    return q,{"joint":j,"angle_deg":round(math.degrees(ang)),"max_move_T":round(mv/T,2)}

def joint_displace(p,T,rng,mag=None):
    j=rng.choice(list(CHAINS)); ch=CHAINS[j]
    mag=mag or rng.choice([0.25,0.5,1.0]); th=rng.uniform(0,2*math.pi)
    d=np.array([math.cos(th),math.sin(th)])*mag*T
    q=p.copy(); q[ch]=p[ch]+d
    return q,{"joint":j,"mag_T":mag}

def global_shift(p,T,rng,mag=None):
    mag=mag or rng.choice([0.3,0.6]); th=rng.uniform(0,2*math.pi)
    return p+np.array([math.cos(th),math.sin(th)])*mag*T,{"mag_T":mag}

def jitter(p,T,rng,sigma=None):
    sigma=sigma or rng.choice([0.08,0.15])
    nr=np.random.default_rng(rng.randrange(1<<30))
    return p+nr.normal(0,sigma*T,p.shape),{"sigma_T":sigma}

def lr_flip(p,T,rng):
    # swap labels only: geometry stays, colours/sides swap
    return p[MIRROR],{}

def wrong_frame(p,T,rng,other=None):
    if other is None: return None
    d=np.nanmean(np.linalg.norm(other[KEY]-p[KEY],axis=1))
    if d<0.5*T: return None
    return other.copy(),{"mean_key_disp_T":round(d/T,2)}

SINGLE_PERTURB={"arm_swap":arm_swap,"leg_swap":leg_swap,"limb_rotate":limb_rotate,"joint_displace":joint_displace,
                "global_shift":global_shift,"jitter":jitter,"lr_flip":lr_flip,"wrong_frame":wrong_frame}
