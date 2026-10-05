/** Shared between server and browser. Nothing here may carry an answer before a game is over. */

export const FRAMES_PER_PUZZLE = 6;

export type Mode = 'daily' | 'endless';
export type PlayStatus = 'playing' | 'won' | 'lost';

export interface SessionUser {
	id: number;
	email: string;
	displayName: string | null;
	isAdmin: boolean;
	emailDaily: boolean;
}

/** One entry in the guess autocomplete: every title in the library, playable or not. */
export interface TitleOption {
	id: number;
	title: string;
	year: number | null;
}

export interface GuessView {
	/** null for a skip. */
	titleId: number | null;
	label: string | null;
	correct: boolean;
}

export interface AnswerView {
	id: number;
	title: string;
	year: number | null;
	posterUrl: string | null;
	overview: string | null;
	imdbId: string | null;
	tmdbId: number | null;
}

export interface CommunityView {
	players: number;
	winRate: number;
	/** Index 0..5 is solved on frame 1..6, index 6 is failed. */
	distribution: number[];
	topGuesses: { label: string; count: number; correct: boolean }[];
}

export interface PlayView {
	id: string;
	mode: Mode;
	puzzleNumber: number | null;
	puzzleDate: string | null;
	/** URLs of the frames revealed so far, in order. All six once the game is over. */
	frames: string[];
	guesses: GuessView[];
	status: PlayStatus;
	answer: AnswerView | null;
	community: CommunityView | null;
}

export interface PlayerStats {
	played: number;
	won: number;
	currentStreak: number;
	maxStreak: number;
	/** Index 0..5 is solved on frame 1..6, index 6 is failed. */
	distribution: number[];
}

export interface EndlessStats {
	played: number;
	won: number;
	currentStreak: number;
	maxStreak: number;
}
