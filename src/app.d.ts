/// <reference types="vite/client" />
import type { SessionUser } from '$lib/types';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** The signed-in user, or null for an anonymous player. */
			user: SessionUser | null;
			/** Random per-browser id from the framed_anon cookie; owns an anonymous player's games. */
			anonId: string;
		}
	}
}

export {};
