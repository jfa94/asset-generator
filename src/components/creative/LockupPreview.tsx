'use client'

import {Lockup} from '@/lib/lockups/lockups'
import type {CreativeSpec, SafeZone, SlotName} from '@/types/creative'
import type {RunBrand} from '@/types/run'

export const assetUrl = (runId: string, file: string): string =>
    `/api/asset?run=${encodeURIComponent(runId)}&f=${encodeURIComponent(file)}`

interface LockupPreviewProps {
    runId: string
    brand: RunBrand
    spec: CreativeSpec
    width: number
    height: number
    safeZone?: SafeZone | undefined
    /** rendered width on the page; the full-size canvas is scaled down to fit */
    displayWidth: number
    onEdit?: ((slot: SlotName, value: string) => void) | undefined
}

/** Live lockup preview: the real render tree, scaled into a displayWidth-wide box. */
const LockupPreview = ({runId, brand, spec, width, height, safeZone, displayWidth, onEdit}: LockupPreviewProps) => {
    const k = displayWidth / width
    return (
        <div style={{width: displayWidth, height: height * k, overflow: 'hidden'}}>
            <div style={{width, height, transform: `scale(${String(k)})`, transformOrigin: 'top left'}}>
                <Lockup
                    spec={spec}
                    width={width}
                    height={height}
                    safeZone={safeZone}
                    fonts={brand.fonts}
                    logoSrc={brand.logoFile === null ? null : assetUrl(runId, brand.logoFile)}
                    imageSrc={spec.imageFile === undefined ? null : assetUrl(runId, spec.imageFile)}
                    onEdit={onEdit}
                />
            </div>
        </div>
    )
}

export default LockupPreview
