// Keep only the font-loading rules from a brand stylesheet so the cockpit can load brand
// fonts without brand CSS bleeding into app styles (lockups are 100% inline-styled).
// ponytail: regex scan, not a CSS parser — @import is a single statement and @font-face
// bodies never nest braces; upgrade to a real parser only if a real brand css breaks it.
export const extractFontCss = (cssText: string): string => {
    const imports = cssText.match(/@import\s[^;]*;/g) ?? []
    const faces = cssText.match(/@font-face\s*\{[^}]*\}/g) ?? []
    return [...imports, ...faces].join('\n')
}
