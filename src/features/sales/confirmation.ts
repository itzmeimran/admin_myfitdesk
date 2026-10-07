import type { Lead } from './model';
import type { ActionConfirmation } from '@/components/ActionConfirmationProvider';

export function salesConfirmation(lead: Lead, command: string, input: unknown): ActionConfirmation {
  const data = input as Record<string, string>;
  const gym = lead.gym;
  const description: Record<string, string> = {
    moveLead: `Move ${gym} to ${data.stage?.replaceAll('_', ' ')}?`,
    logActivity: `Save this ${data.type?.toLowerCase() ?? 'activity'} in ${gym}'s CRM history?`,
    scheduleFollowUp: `Schedule this ${data.type?.toLowerCase() ?? ''} follow-up for ${gym}?`,
    completeFollowUp: `Mark this follow-up for ${gym} as completed?`,
    saveDemo: `Save these demo arrangements for ${gym}?`,
    setDemoStatus: `Mark ${gym}'s demo as ${data.status?.toLowerCase()}?`,
    reassign: `Reassign ${gym}? Lead access will follow the new assignment.`,
    closeLead: `Mark ${gym} as ${data.outcome?.toLowerCase()}? Existing follow-ups will stop${data.outcome === 'Follow up later' ? ' and a revisit will be scheduled' : ''}.`,
    resolveDuplicate: data.mode === 'merge' ? `Merge ${gym} with the matching lead? Its activity and follow-ups will move to the retained lead.` : `Keep ${gym} as a separate lead?`,
    togglePriority: `${lead.priority === 'high' ? 'Remove high priority from' : 'Mark as high priority:'} ${gym}?`,
    reopen: `Reopen ${gym} for sales follow-up?`,
    convert: data.how === 'invite' ? `Create a trial gym account for ${gym} and email its owner an invitation? The lead stays in Trial started and follow-ups remain open.`
      : data.how === 'paid' ? `Confirm ${gym} as a paid conversion? Its linked subscription must be active on a paid plan. Sales follow-ups will stop.`
      : `Link ${gym} to the selected existing account? Trial accounts stay in Trial started; an active paid account is marked Converted. The gym's existing data and subscription stay unchanged.`,
  };
  return { title: 'Are you sure?', description: description[command] ?? `Apply this change to ${gym}?`,
    confirmLabel: command === 'convert' && data.how === 'invite' ? 'Create gym & send invite' : 'Yes, apply change',
    danger: command === 'closeLead' || command === 'resolveDuplicate' && data.mode === 'merge' };
}
