import type {RunState} from '@/types/run'

interface ApprovalFormProps {
    run: RunState
    action: (formData: FormData) => Promise<void>
}

const inputClass = 'w-full rounded bg-neutral-800 px-3 py-2 text-sm'

interface FieldProps {
    label: string
    name: string
    defaultValue: string
    rows?: number
    /** what the field is and where it flows downstream */
    hint?: string
}

const Field = ({label, name, defaultValue, rows, hint}: FieldProps) => (
    <label className='flex flex-col gap-1 text-sm text-neutral-300'>
        {label}
        {hint !== undefined && <span className='text-xs text-neutral-500'>{hint}</span>}
        {rows === undefined ? (
            <input name={name} defaultValue={defaultValue} className={inputClass} />
        ) : (
            <textarea name={name} defaultValue={defaultValue} rows={rows} className={inputClass} />
        )}
    </label>
)

/** Brief + theme proposals, inline-editable; submitting approves and hands off to the agent. */
const ApprovalForm = ({run, action}: ApprovalFormProps) => {
    const brief = run.brief
    if (brief === undefined) {
        return <p className='text-sm text-neutral-400'>Waiting for the agent to draft the brief…</p>
    }
    return (
        <form action={action} className='space-y-8'>
            <section className='space-y-4 rounded-lg bg-neutral-900 p-5'>
                <h2 className='text-lg font-medium'>Brief</h2>
                <Field
                    label='Product'
                    name='product'
                    defaultValue={brief.product}
                    hint='What is being advertised — names the campaigns and anchors every claim.'
                />
                <Field
                    label='Audience'
                    name='audience'
                    defaultValue={brief.audience}
                    rows={2}
                    hint='Who the ads target — shapes tone, pain points, and platform copy.'
                />
                <Field
                    label='Value props (one per line)'
                    name='valueProps'
                    defaultValue={brief.valueProps.join('\n')}
                    rows={4}
                    hint='Each line becomes headline and description material across all platforms.'
                />
                <Field
                    label='Offer'
                    name='offer'
                    defaultValue={brief.offer}
                    hint='The concrete deal (price, trial, guarantee) used by offer-angle copy and badges.'
                />
                <Field
                    label='Landing URL'
                    name='landingUrl'
                    defaultValue={brief.landingUrl}
                    hint='Where the ads click through — copy claims must match this page.'
                />
                <Field
                    label='Brand voice'
                    name='voice'
                    defaultValue={brief.voice}
                    rows={3}
                    hint='Hard constraints on all copy; Say/Avoid rules here override everything else.'
                />
            </section>

            <section className='space-y-4'>
                <h2 className='text-lg font-medium'>Campaign themes</h2>
                {(run.themes ?? []).map((theme, i) => (
                    <div key={theme.slug} className='space-y-3 rounded-lg bg-neutral-900 p-5'>
                        <p className='font-mono text-xs text-neutral-500'>{theme.slug}</p>
                        <Field
                            label='Name'
                            name={`theme.${String(i)}.name`}
                            defaultValue={theme.name}
                            hint='The campaign concept in a phrase — used for folders and reporting.'
                        />
                        <Field
                            label='Angle'
                            name={`theme.${String(i)}.angle`}
                            defaultValue={theme.angle}
                            hint='The persuasion strategy: benefit, proof, offer, problem, or differentiation.'
                        />
                        <Field
                            label='Tone'
                            name={`theme.${String(i)}.tone`}
                            defaultValue={theme.tone}
                            rows={2}
                            hint='How this campaign sounds within the brand voice.'
                        />
                        <Field
                            label='Sample headline'
                            name={`theme.${String(i)}.sampleHeadline`}
                            defaultValue={theme.sampleHeadline}
                            hint='North-star headline — seeds the creatives and copy slates.'
                        />
                        <Field
                            label='Visual direction'
                            name={`theme.${String(i)}.visualDirection`}
                            defaultValue={theme.visualDirection}
                            rows={2}
                            hint='Which lockup layouts and palette emphasis the creatives should use.'
                        />
                    </div>
                ))}
            </section>

            <button type='submit' className='rounded bg-emerald-600 px-5 py-2 font-medium'>
                Approve &amp; generate
            </button>
        </form>
    )
}

export default ApprovalForm
