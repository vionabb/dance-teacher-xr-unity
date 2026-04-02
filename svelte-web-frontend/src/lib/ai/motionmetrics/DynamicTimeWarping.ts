/**
 * Dynamic Time Warping
 *
 * This is a simple implementation of the Dynamic Time Warping algorithm.
 * The algorithm is used to compare two time series of arbitrary length.
 *
 * Modified from the following source: https://github.com/GordonLesti/dynamic-time-warping/blob/master/src/dynamic-time-warping.js
 */
export class DynamicTimeWarping<T1, T2> {
	private distance: number | undefined;
	private matrix: number[][] | undefined;
	private path: [number, number][] | undefined;
	private ser1: T1[];
	private ser2: T2[];
	private distFunc: (arg0: T1, arg2: T2) => number;

	constructor(ts1: T1[], ts2: T2[], distanceFunction: (arg0: T1, arg2: T2) => number) {
		this.ser1 = ts1;
		this.ser2 = ts2;
		this.distFunc = distanceFunction;
		this.distance = undefined;
		this.matrix = undefined;
		this.path = undefined;
	}

	getDistance() {
		if (this.distance !== undefined) {
			return this.distance;
		}
		const m = this.ser1.length;
		const n = this.ser2.length;
		type Cell = { i: number; j: number; cost: number };
		const key = (i: number, j: number) => `${i},${j}`;
		const queue: Cell[] = [];
		const costMap = new Map<string, number>();
		const predecessor = new Map<string, [number, number]>();

		// initialize with starting cell
		const startCost = this.distFunc(this.ser1[0], this.ser2[0]);
		queue.push({ i: 0, j: 0, cost: startCost });
		costMap.set(key(0, 0), startCost);

		while (queue.length) {
			// simple priority queue: sort by cost and get smallest
			queue.sort((a, b) => a.cost - b.cost);
			const current = queue.shift()!;
			const { i, j, cost } = current;
			if (i === m - 1 && j === n - 1) {
				this.distance = cost;
				// reconstruct path from (0,0) to (m-1,n-1)
				const path: [number, number][] = [];
				let curKey = key(i, j);
				path.push([i, j]); // Add the final cell (m-1, n-1) to the path
				while (curKey !== key(0, 0)) {
					const [pi, pj] = predecessor.get(curKey)!;
					path.push([pi, pj]);
					curKey = key(pi, pj);
				}
				path.reverse();
				this.path = path;
				return this.distance;
			}
			// Explore neighbors: diagonal (preferred), right, down
			const neighbors: [number, number][] = [
				[i + 1, j + 1],
				[i + 1, j],
				[i, j + 1]
			];
			for (const [ni, nj] of neighbors) {
				if (ni >= m || nj >= n) continue;
				const neighborKey = key(ni, nj);
				const newCost = cost + this.distFunc(this.ser1[ni], this.ser2[nj]);
				if (!costMap.has(neighborKey) || newCost < costMap.get(neighborKey)!) {
					costMap.set(neighborKey, newCost);
					predecessor.set(neighborKey, [i, j]);
					queue.push({ i: ni, j: nj, cost: newCost });
				}
			}
		}
		return Infinity;
	}

	getPath() {
		if (this.path !== undefined) {
			return this.path;
		}
		// Force calculation (this will also set the path)
		this.getDistance();
		return this.path!;
	}
}
