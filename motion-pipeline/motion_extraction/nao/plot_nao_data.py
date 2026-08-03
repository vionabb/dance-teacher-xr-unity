# %%
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

# %%
# Read data
traj_filename = 'last-christmas-tutorial.nao.csv'
data = pd.read_csv(traj_filename, header=0, index_col=None)
for col in data.columns:
    plt.plot(np.degrees(data[col]), label=col)
plt.xlabel('Frame')
plt.ylabel('Angle (deg)')
plt.legend()
plt.title(f'{traj_filename} joint angles')
plt.show()

plt.figure()
dataderiv = data.diff()
for col in dataderiv.columns:
    line = plt.plot(np.degrees(dataderiv[col]), label=col)
plt.legend()
plt.xlabel('Frame')
plt.ylabel('Anglular Vel (deg / frame)')
plt.title(f'{traj_filename} joint velocities')
plt.show()

#%%
# Find ranges where left elbow roll and right elbow roll are within 10 degrees of zero
# and plot the ranges
# lelbow_straight_ranges = 

ang_threshold_deg = 10.
def find_contiguous_groups(data):
    d = [i for i, df in enumerate(np.diff(data)) if df!= 1] 
    d = np.hstack([-1, d, len(data)-1])  # add first and last elements 
    d = np.vstack([d[:-1]+1, d[1:]]).T
    return d

lelbow_isnearlystraight = np.where(np.abs(data['LElbowRoll']) < np.radians(ang_threshold_deg))[0]
lelbow_nearlystraight_ranges = lelbow_isnearlystraight[find_contiguous_groups(lelbow_isnearlystraight)]
del lelbow_isnearlystraight
relbow_isnearlystraight = np.where(np.abs(data['RElbowRoll']) < np.radians(ang_threshold_deg))[0]
relbow_nearlystraight_ranges = relbow_isnearlystraight[find_contiguous_groups(relbow_isnearlystraight)]
del relbow_isnearlystraight

# %%

# Plot left and right arm  - roll and yaw
for prefix, highlight_ranges in [
    ('L', lelbow_nearlystraight_ranges),
    ('R', relbow_nearlystraight_ranges),
]:
    plt.figure()
    for joint in ['ElbowYaw', 'ElbowRoll']:
        full_joint = prefix + joint
        plt.plot(np.degrees(np.abs(data[f'{full_joint}'])), label=full_joint)
    plt.xlabel('Frame')
    plt.ylabel('Angle (deg)')
    plt.legend()
    plt.title(f'{traj_filename} {prefix}Elbow angles')
    plt.show()

    plt.figure()
    for joint in ['ElbowYaw']:
        full_joint = prefix + joint
        plt.plot(np.degrees(np.abs(data[f'{full_joint}'])), label=full_joint)
    plt.xlabel('Frame')
    plt.ylabel('Angle (deg)')
    plt.legend()
    plt.title(f'{traj_filename} {prefix}Elbow angles (<{ang_threshold_deg} deg angle hl)')
    for start, end in highlight_ranges:
        plt.axvspan(start, end, color='red', alpha=0.2)
    plt.show()

    plt.figure()
    for joint in ['ElbowYaw']:
        full_joint = prefix + joint
        plt.plot(np.degrees(np.abs(dataderiv[f'{full_joint}'])), label=full_joint)
    plt.xlabel('Frame')
    plt.ylabel('Angular Vel (deg / frame)')
    plt.legend()
    plt.title(f'{traj_filename} {prefix}Elbow velocities (<{ang_threshold_deg} deg angle hl)')
    for start, end in highlight_ranges:
        plt.axvspan(start, end, color='red', alpha=0.2)
    plt.show()

# %%
peak_height = 0.3
import scipy.signal as signal

for prefix, title in [
    ('L', 'LArm'), 
    ('R', 'RArm'), 
    ('H', 'Head')
]:
    # find peaks
    for col in [c for c in dataderiv.columns if c.startswith(prefix)]:
        peaks, _ = signal.find_peaks(dataderiv[col], height=peak_height)
        valleys, _ = signal.find_peaks(-dataderiv[col], height=peak_height)

        line, = plt.plot(dataderiv[col], label=col)
        linecolor = line.get_color()
        peakplot, = plt.plot(peaks, dataderiv[col][peaks], "x", color=linecolor)
        peakcolor = peakplot.get_color()
        valleyplot, = plt.plot(valleys, dataderiv[col][valleys], "x", color=peakcolor)
    plt.legend()
    plt.title(f'{traj_filename} {title} joint velocities')
    plt.show()

# %%

