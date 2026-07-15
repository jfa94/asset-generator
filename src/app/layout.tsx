import type {Metadata} from 'next'
import type {ReactNode} from 'react'
import './globals.css'

export const metadata: Metadata = {title: 'Asset Generator'}

interface RootLayoutProps {
    children: ReactNode
}

const RootLayout = ({children}: RootLayoutProps) => (
    <html lang='en'>
        <body className='min-h-screen bg-neutral-950 text-neutral-100 antialiased'>
            <main className='mx-auto max-w-5xl px-6 py-10'>{children}</main>
        </body>
    </html>
)

export default RootLayout
