
export interface OsuMatchResult {
    match: {
        match_id: string;
        name: string;
        end_time: string | null;
    };
    games: OsuGame[];
}

export interface OsuGame {
    game_id: string;
    beatmap_id: string;
    mods: string;
    scores: OsuScore[];
}

export interface OsuScore {
    user_id: string;
    score: string;
    maxcombo: string;
    count50: string;
    count100: string;
    count300: string;
    countmiss: string;
    pass: string;
    enabled_mods: string | null;
}


export interface SheetRow {
    get id(): string;
    set id(value: string);
    get value(): string;
    set value(value: string);
    delete(): Promise<void>;
    save(): Promise<void>;
}


export type StatsDataRow = [
    matchName: string,
    matchID: number,
    scoreID: number,
    mapID: number,
    userID: number,
    score: number,
    accuracy: number,
    grade: string,
    playerMods: string,
    passStatus: boolean,
];


export type CellValue = string | number | boolean | null;

export type MpFetcher = (id: number | string) => Promise<OsuMatchResult>;

export type Grade = 'SSH' | 'SS' | 'SH' | 'S' | 'A' | 'B' | 'C' | 'D';
