"use client";

import {
  AddIcon, AlertIcon, ArchiveIcon, CalendarIcon, CallIcon, CancelIcon,
  ConfirmIcon, CopyIcon, CrmIcon, DatabaseIcon, DetailsIcon, EditIcon,
  ExportIcon, GymsIcon, InviteIcon, ListIcon, LoadMoreIcon, MailIcon,
  ManageIcon, MoreIcon, PackagesIcon, RestoreIcon, RetryIcon, SendIcon,
  SignInIcon, SignOutIcon, SuspendIcon, TemplateIcon, TrialsIcon,
  WhatsAppIcon, type IconType,
} from './icons';

/** Shared vocabulary for buttons whose action label comes from a menu or modal. */
export function iconForAction(label: string): IconType {
  const action = label.toLowerCase();
  if (/archive|cancel subscription/.test(action)) return ArchiveIcon;
  if (/cancel|dismiss|clear|remove filter/.test(action)) return CancelIcon;
  if (/copy/.test(action)) return CopyIcon;
  if (/export|download/.test(action)) return ExportIcon;
  if (/retry|try again|refresh|re-check/.test(action)) return RetryIcon;
  if (/reopen|restore|resume|unblock|switch back/.test(action)) return RestoreIcon;
  if (/pause|block|suspend/.test(action)) return SuspendIcon;
  if (/logout|sign out/.test(action)) return SignOutIcon;
  if (/sign in|log in/.test(action)) return SignInIcon;
  if (/invite|assign/.test(action)) return InviteIcon;
  if (/load/.test(action)) return LoadMoreIcon;
  if (/more/.test(action)) return MoreIcon;
  if (/save|confirm|accept|done|resolve|acknowledge|got it/.test(action)) return ConfirmIcon;
  if (/add|create|new|log activity/.test(action)) return AddIcon;
  if (/edit|change/.test(action)) return EditIcon;
  if (/review|view|details/.test(action)) return DetailsIcon;
  if (/attention|overdue|lost/.test(action)) return AlertIcon;
  if (/trial/.test(action)) return TrialsIcon;
  if (/follow.?up|demo|schedule|date|days|calendar/.test(action)) return CalendarIcon;
  if (/call/.test(action)) return CallIcon;
  if (/whatsapp/.test(action)) return WhatsAppIcon;
  if (/email/.test(action)) return MailIcon;
  if (/send/.test(action)) return SendIcon;
  if (/template/.test(action)) return TemplateIcon;
  if (/gym/.test(action)) return GymsIcon;
  if (/lead|pipeline|crm|convert|conversion/.test(action)) return CrmIcon;
  if (/package|plan|tier/.test(action)) return PackagesIcon;
  if (/backup|recovery|environment/.test(action)) return DatabaseIcon;
  if (/filter|coverage|settings|manage|role|team|credits|maintenance/.test(action)) return ManageIcon;
  if (/list|all|my|unassigned/.test(action)) return ListIcon;
  return DetailsIcon;
}
