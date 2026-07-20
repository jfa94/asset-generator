'use client'

import {useRouter} from 'next/navigation'
import {useEffect} from 'react'

interface AutoRefreshProps {
    ms?: number
}

/** Polls while the agent works; run.json on disk is the source of truth. */
const AutoRefresh = ({ms = 2000}: AutoRefreshProps) => {
    const router = useRouter()
    useEffect(() => {
        const t = setInterval(() => {
            router.refresh()
        }, ms)
        return () => {
            clearInterval(t)
        }
    }, [router, ms])
    return null
}

export default AutoRefresh
