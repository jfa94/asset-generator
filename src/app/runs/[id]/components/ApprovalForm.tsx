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
}

const Field = ({label, name, defaultValue, rows}: FieldProps) => (
    <label className='flex flex-col gap-1 text-sm text-neutral-300'>
        {label}
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
                <Field label='Product' name='product' defaultValue={brief.product} />
                <Field label='Audience' name='audience' defaultValue={brief.audience} rows={2} />
                <Field
                    label='Value props (one per line)'
                    name='valueProps'
                    defaultValue={brief.valueProps.join('\n')}
                    rows={4}
                />
                <Field label='Offer' name='offer' defaultValue={brief.offer} />
                <Field label='Landing URL' name='landingUrl' defaultValue={brief.landingUrl} />
                <Field label='Brand voice' name='voice' defaultValue={brief.voice} rows={3} />
            </section>

            <section className='space-y-4'>
                <h2 className='text-lg font-medium'>Campaign themes</h2>
                {(run.themes ?? []).map((theme, i) => (
                    <div key={theme.slug} className='space-y-3 rounded-lg bg-neutral-900 p-5'>
                        <p className='font-mono text-xs text-neutral-500'>{theme.slug}</p>
                        <Field label='Name' name={`theme.${String(i)}.name`} defaultValue={theme.name} />
                        <Field label='Angle' name={`theme.${String(i)}.angle`} defaultValue={theme.angle} />
                        <Field label='Tone' name={`theme.${String(i)}.tone`} defaultValue={theme.tone} rows={2} />
                        <Field
                            label='Sample headline'
                            name={`theme.${String(i)}.sampleHeadline`}
                            defaultValue={theme.sampleHeadline}
                        />
                        <Field
                            label='Visual direction'
                            name={`theme.${String(i)}.visualDirection`}
                            defaultValue={theme.visualDirection}
                            rows={2}
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
