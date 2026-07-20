import type {MetaCopy, PmaxCopy, RsaCopy} from '@/types/copy'
import type {CreativeSpec} from '@/types/creative'

// run.json is the single interface between the cockpit UI and the agent.
// UI transitions: awaiting-approval→generating, reviewing→regenerating|finalizing.
// Agent transitions: briefing→awaiting-approval, generating→reviewing,
// regenerating→reviewing, finalizing→complete.
export type RunStatus =
    'briefing' | 'awaiting-approval' | 'generating' | 'reviewing' | 'regenerating' | 'finalizing' | 'complete'

export interface Brief {
    product: string
    audience: string
    valueProps: string[]
    offer: string
    landingUrl: string
    voice: string
}

export interface Theme {
    slug: string
    name: string
    angle: string
    tone: string
    sampleHeadline: string
    visualDirection: string
}

// Defined here (not domain/formats.ts) because types is an import leaf; domain re-uses it.
export type AdFormatName = 'landscape' | 'square' | 'portrait' | 'feed' | 'story'

export type ReviewStatus = 'pending' | 'approved' | 'redo'

export interface Review {
    status: ReviewStatus
    note: string
}

export interface Creative {
    variant: number
    spec: CreativeSpec
    /** one review covers this variant across all output formats */
    review: Review
}

/** Brand assets the agent copies into the run dir so /api/asset can serve them. */
export interface RunBrand {
    /** run-dir-relative brand stylesheet (@import/@font-face for the cockpit preview) */
    cssFile: string
    /** concrete font family names, loaded by cssFile */
    fonts: {display: string; body: string}
    /** run-dir-relative logo image; null when the repo has none */
    logoFile: string | null
}

export interface CampaignCopy {
    rsa: RsaCopy
    pmax: PmaxCopy
    meta: MetaCopy
}

export interface Campaign {
    slug: string
    copy: CampaignCopy
    copyReviews: {rsa: Review; pmax: Review; meta: Review}
    creatives?: Creative[]
}

export interface RunState {
    id: string
    createdAt: string
    repoPath: string
    campaignCount: number
    status: RunStatus
    brief?: Brief
    themes?: Theme[]
    campaigns?: Campaign[]
    brand?: RunBrand
    /** Final Downloads path, set by the agent on completion. */
    outputDir?: string
}
