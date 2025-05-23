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
import { promisify } from "util";

const DB_NAME = "motion_metrics.db"; // hosted at cwd
const TABLE_NAME = "motion_metrics";

const dbRun = promisify(sqlite3.Database.prototype.run);
const dbGet = promisify(sqlite3.Database.prototype.get);
const dbAll = promisify(sqlite3.Database.prototype.all);

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
 * Add a column to the motion metrics table if it doesn't exist (type=REAL)
 * @param db Metric Database
 * @param columnName The name of the column to ensure exists
 */
export function ensureMetricColumnInTable(db: sqlite3.Database, columnName: string) {
    const sql = `ALTER TABLE ${TABLE_NAME} ADD COLUMN ${columnName} REAL`;

    db.run(sql, (err: any) => {
        if (err) {
            if (err.message.includes("duplicate column name")) {
                return; // Column already exists, do nothing
            } else {
                console.error('Error adding column ' + err.message);
            }
        } else {
            console.log(`Column ${columnName} added to metricDB successfully.`);
        }
    });
}

/**
 * Add or update a motion metric row in the database. Will create a column for each
 * entry in the metricData object if it doesn't exist. Otherwise, it will be updated.
 * Columns not present for this metric wil be left alone.
 * @param db Metric Database
 * @param rowData Fixed motion clip data (not from a motion metric)
 * @param metricData Computed metric data (from a motion metric)
 */
export async function upsertMetricDbRow(db: sqlite3.Database, rowData: RowData, metricData: Record<string, number>) {
    
    const { userId, danceId, studyName, workflowId, clipNumber, collectionId } = rowData;

    // Check if the row already exists
    const sqlCheck = `SELECT * FROM ${TABLE_NAME} WHERE userId = ? AND danceId = ? AND workflowId = ? AND clipNumber = ? AND collectionId = ?`;
    db.get(sqlCheck, [userId, danceId, workflowId, clipNumber, collectionId], (err: any, row: any) => {
        if (err) {
            console.error('Error checking row existence ' + err.message);
            return;
        }

        if (row) {
            // Row exists, update it
            const updateSql = `UPDATE ${TABLE_NAME} SET ${Object.keys(metricData).map(key => `${key} = ?`).join(', ')} WHERE userId = ? AND danceId = ? AND workflowId = ? AND clipNumber = ? AND collectionId = ?`;
            const params = [...Object.values(metricData), userId, danceId, workflowId, clipNumber, collectionId];
            db.run(updateSql, params, (err: any) => {
                if (err) {
                    console.error('Error updating row ' + err.message);
                } else {
                    console.log('Row updated successfully.');
                }
            });
        } else {
            // Row does not exist, insert it
            const insertSql = `INSERT INTO ${TABLE_NAME} (${Object.keys(rowData).concat(Object.keys(metricData)).join(', ')}) VALUES (${[...Array(Object.keys(rowData).length + Object.keys(metricData).length)].map(() => '?').join(', ')})`;
            const params = [...Object.values(rowData), ...Object.values(metricData)];
            db.run(insertSql, params, (err: any) => {
                if (err) {
                    console.error('Error inserting row ' + err.message);
                } else {
                    // no-op
                    // console.log('Row inserted successfully.');
                }
            });
        }
    });

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
