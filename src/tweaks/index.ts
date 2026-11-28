import { liveMarkdown } from "./live-markdown";
import { staticFavicon } from "./static-favicon";
import type { Tweak } from "./types";

// Register new tweaks here.
export const tweaks: Tweak[] = [staticFavicon, liveMarkdown];
