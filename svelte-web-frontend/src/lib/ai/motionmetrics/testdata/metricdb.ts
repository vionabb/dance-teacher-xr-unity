/**
 * Code for interfacing with the sqllite3 database used
 * for storing the motion metric outputs.
 * 
 * 
 */

import sqlite3 from "sqlite3";
import { readFile, writeFile } from "fs/promises";
import fs from "fs";
import Papa from "papaparse";

const DB_NAME = "motion_metrics.db"; // hosted at cwd
const TABLE_NAME = "motion_metrics";

type ID_COLS = {
    userId: number;
    danceId: string;
    studyName: string;
    workflowId: string;
    clipNumber: number;
    collectionId: string;
}

type FIXED_COLS = ID_COLS & {
    danceName: string;
    studyName: string;
    condition: string;
    performanceSpeed: number;
    frameCount: number;
}

// There are also dynamic columns that are added to the table for
// each metric that is run. Metrics can add multiple columns if they 
// output multiple quantitative values for a single metric.
async function createTableIfNecessary(db: sqlite3.Database) {

    // abort if the table already exists
    const tableExists = await new Promise((resolve) => {
        db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='${TABLE_NAME}'`, (err: any, row: any) => {
            if (err) {
                console.error('Error checking table existence ' + err.message);
                resolve(false);
            } else {
                resolve(row !== undefined);
            }
        });
    }) as boolean;

    if (tableExists) {
        console.log('Table already exists, skipping creation.');
        return;
    }

    const sql = `
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
            userId INTEGER,
            danceId TEXT,
            studyName TEXT,
            workflowId TEXT,
            clipNumber INTEGER,
            collectionId TEXT,
            danceName TEXT,
            condition TEXT,
            performanceSpeed REAL,
            frameCount INTEGER
        );
    `;

    db.run(sql, (err: any) => {
        if (err) {
            console.error('Error creating table ' + err.message);
        } else {
            console.log('Table created or already exists.');
        }
    });

    // Now, define the composite primary key constraint:
    const compositeKeyConstraint = "PRIMARY KEY (userId, danceId, workflowId, clipNumber, collectionId)";

    const addConstraintSQL = `ALTER TABLE ${TABLE_NAME} ADD CONSTRAINT ${compositeKeyConstraint};`;

    db.run(addConstraintSQL, (err: any) => {
        if (err) {
            console.error('Error adding composite primary key constraint ' + err.message);
        } else {
            console.log('Composite primary key constraint added.');
        }
    });
}

export async function loadDB() {

    // Db will be created if it doesn't exist
    const dbPath = `${process.cwd()}/artifacts/${DB_NAME}`;
    const db = new sqlite3.Database(dbPath, (err: any) => {
        if (err) {
            console.error('Error opening database ' + err.message);
        } else {
            console.log('Connected to the SQlite database.');
        }
    });

    await createTableIfNecessary(db);

    return db;
}

// Corresponding to:
//      userId INTEGER,
//      danceId TEXT,
//      studyName TEXT,
//      workflowId TEXT,
//      clipNumber INTEGER,
//      collectionId TEXT,
//      danceName TEXT,
//      condition TEXT,
//      performanceSpeed REAL,
//      frameCount INTEGER
export type RowData = {
    userId: number;
    danceId: string;
    studyName: string;
    workflowId: string;
    clipNumber: number;
    collectionId: string;
    danceName: string;
    condition: string;
    performanceSpeed: number;
    frameCount: number;
}

/**
 * Add or update a motion metric row in the database. Will create a column for each
 * entry in the metricData object if it doesn't exist. Otherwise, it will be updated.
 * Columns not present for this metric wil be left alone.
 * @param db Metric Database
 * @param rowData Fixed motion clip data (not from a motion metric)
 * @param metricData Computed metric data (from a motion metric)
 */
export async function upsertMetricRow(db: sqlite3.Database, rowData: RowData, metricData: Record<string, number>) {
    
}

export async function exportCSV(db: sqlite3.Database) {
    const csvPath = `${process.cwd()}/artifacts/motion_metrics.csv`;
    const sql = `SELECT * FROM ${TABLE_NAME}`;
    const csvData: string[] = [];

    db.all(sql, [], async (err: any, rows: any[]) => {
        if (err) {
            throw err;
        }
        const csv = Papa.unparse(rows);
        await writeFile(csvPath, csv, "utf8");
        console.log("CSV exported successfully.");
    });

    await writeFile(csvPath, csvData.join('\n'), 'utf8');
}
