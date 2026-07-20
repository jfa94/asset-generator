// CreativeSpec crosses the run.json boundary (agent-written, UI-edited), so copy is a flat
// bag validated at runtime (lockups.missingSlots) — a discriminated union wouldn't survive JSON.

export type LockupId = 'poster' | 'screenshot-panel' | 'screenshot-bleed' | 'image-hero' | 'stat' | 'proof' | 'badge'

export type SlotName = 'headline' | 'subline' | 'proof' | 'attribution' | 'badge' | 'stat' | 'statLabel'

export type LockupCopy = {headline: string} & Partial<Record<Exclude<SlotName, 'headline'>, string>>

export interface Palette {
    background: string
    text: string
    accent: string
}

export interface SafeZone {
    /** fraction of height to keep clear at the top (platform UI chrome) */
    top: number
    /** fraction of height to keep clear at the bottom (CTA sticker area) */
    bottom: number
}

export interface CreativeSpec {
    lockup: LockupId
    palette: Palette
    copy: LockupCopy
    /** run-dir-relative image file; required by image lockups (see LOCKUP_META) */
    imageFile?: string
}
