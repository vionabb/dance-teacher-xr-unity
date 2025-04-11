import argparse
import pandas as pd

def main():
    parser = argparse.ArgumentParser(description='Process dance performance ratings.')
    parser.add_argument('input', help='Path to the input Excel file')
    parser.add_argument('output', help='Path to the output CSV file')
    args = parser.parse_args()

    # Read all sheets from the excel file
    sheets = pd.read_excel(args.input, sheet_name=None)
    
    records = []
    for sheet_name, df in sheets.items():
        # Expecting sheet_name in format <dance>_<rater>
        try:
            dance, rater = sheet_name.split('_')
        except ValueError:
            continue  # or handle error as needed
        
        # Assume first column is 'id', others are segments: seg1, seg2,...
        id_col = df.columns[0]
        dance_col = df.columns[1]
        seg_cols = df.columns[2:]
        
        # melt dataframe to have one row per segment rating per user
        df_melt = df.melt(id_vars=id_col, value_vars=seg_cols, var_name='segment', value_name='rating')
        for _, row in df_melt.iterrows():
            rating = row['rating'] if isinstance(row['rating'], (int, float)) else None
            if rating is None:
                continue
            
            record = {
                'dance': dance,
                'user_id': row[id_col],
                'segment': row['segment'],
                'rater': rater,
                'rating': rating
            }
            records.append(record)
    
    # Create a combined DataFrame of all records
    all_ratings = pd.DataFrame(records)
    
    # Pivot so that each (dance, user_id, segment) has columns for each rater's rating.
    pivot = all_ratings.pivot_table(index=['dance','user_id','segment'], columns='rater', values='rating').reset_index()
    
    # Identify rater columns sorted alphabetically then assign to rating 1, 2, 3.
    rater_cols = sorted([col for col in pivot.columns if col not in ['dance','user_id','segment']])
    pivot['rating 1'] = pivot[rater_cols[0]]
    pivot['rating 2'] = pivot[rater_cols[1]]
    pivot['rating 3'] = pivot[rater_cols[2]]
    
    # Calculate avgRatingPercentile = (sum of ratings)/9, since (avg rating)/3 = ((sum/3)/3)
    pivot['avgRatingPercentile'] = (pivot['rating 1'] + pivot['rating 2'] + pivot['rating 3']) / 9
    
    # Select and reorder columns as specified.
    out_df = pivot[['dance', 'user_id', 'segment', 'avgRatingPercentile', 'rating 1', 'rating 2', 'rating 3']]
    
    out_df.to_csv(args.output, index=False)
    
if __name__ == '__main__':
    main()
