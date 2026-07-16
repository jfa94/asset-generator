import type {MetaCopy, PmaxCopy, RsaCopy} from '@/types/copy'

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

export interface ImageAsset {
    /** Path relative to the run directory. */
    file: string
    platform: 'google-pmax' | 'meta'
    format: AdFormatName
    variant: number
    review: Review
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
    images: ImageAsset[]
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
    /** Final Downloads path, set by the agent on completion. */
    outputDir?: string
}
