import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { APP_USERS } from './UserContext';
import { APPROVER_ROSTER } from '../types/approvalRequest';

const PLAN_APPROVER_ROLES = ['Finance', 'Supply Chain', 'Sales Ops', 'Product Management'] as const;

export type HeaderNotificationKind = 'plan_approval_request' | 'plan_approver_decision';

export interface HeaderNotification {
  id: string;
  recipientUserId: string;
  kind: HeaderNotificationKind;
  title: string;
  body: string;
  createdAt: Date;
  read: boolean;
}

function approverNameToUserId(name: string): string | undefined {
  return APP_USERS.find((u) => u.name === name)?.id;
}

export type PublishPlanApprovalParams = {
  requesterName: string;
  planLabel?: string;
  notes?: string;
};

export type PlanApproverDecisionOutcome = 'approved' | 'approvedWithCondition' | 'rejected';

export type PublishPlanApproverDecisionForRequesterParams = {
  requesterUserId: string;
  approverName: string;
  outcome: PlanApproverDecisionOutcome;
  planLabel?: string;
  notes?: string;
};

type NotificationsPanelOpenRequest = { userId: string; nonce: number };

type NotificationsContextValue = {
  notifications: HeaderNotification[];
  /** After plan is submitted for approval — one unread notification per approver. */
  publishPlanApprovalRequested: (params: PublishPlanApprovalParams) => void;
  /** When an approver records a decision — notify the plan submitter (bell + optional panel open). */
  publishPlanApproverDecisionForRequester: (params: PublishPlanApproverDecisionForRequesterParams) => void;
  /** When plan returns to Draft and requests are withdrawn. */
  withdrawPlanApprovalNotifications: () => void;
  markNotificationRead: (id: string) => void;
  markAllReadForUser: (userId: string) => void;
  /** Present when the requester should auto-open the notifications popover (consumed by Header). */
  notificationsPanelOpenRequest: NotificationsPanelOpenRequest | null;
  consumeNotificationsPanelOpenRequest: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const DEFAULT_PLAN_LABEL = 'Planning & Forecasting FY26';

function decisionOutcomeVerb(outcome: PlanApproverDecisionOutcome): string {
  switch (outcome) {
    case 'approved':
      return 'approved';
    case 'approvedWithCondition':
      return 'approved with conditions';
    case 'rejected':
      return 'rejected';
    default:
      return 'updated';
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<HeaderNotification[]>([]);
  const [notificationsPanelOpenRequest, setNotificationsPanelOpenRequest] =
    useState<NotificationsPanelOpenRequest | null>(null);

  const consumeNotificationsPanelOpenRequest = useCallback(() => {
    setNotificationsPanelOpenRequest(null);
  }, []);

  const publishPlanApprovalRequested = useCallback(
    ({ requesterName, planLabel = DEFAULT_PLAN_LABEL, notes }: PublishPlanApprovalParams) => {
      const createdAt = new Date();
      const batchKey = `plan-appr-${createdAt.getTime()}`;
      setNotifications((prev) => {
        const rest = prev.filter((n) => n.kind !== 'plan_approval_request');
        const added: HeaderNotification[] = [];
        for (const role of PLAN_APPROVER_ROLES) {
          const entry = APPROVER_ROSTER[role];
          if (!entry) continue;
          const recipientUserId = approverNameToUserId(entry.name);
          if (!recipientUserId) continue;
          const bodyLines = [
            `${requesterName} submitted ${planLabel} for your review as ${role}.`,
            'Open Planning & Forecasting to review and approve.',
          ];
          if (notes?.trim()) {
            bodyLines.push(`Requester note: ${notes.trim()}`);
          }
          added.push({
            id: `${batchKey}-${recipientUserId}`,
            recipientUserId,
            kind: 'plan_approval_request',
            title: 'Planning approval requested',
            body: bodyLines.join('\n\n'),
            createdAt,
            read: false,
          });
        }
        return [...rest, ...added];
      });
    },
    []
  );

  const publishPlanApproverDecisionForRequester = useCallback(
    ({
      requesterUserId,
      approverName,
      outcome,
      planLabel = DEFAULT_PLAN_LABEL,
      notes,
    }: PublishPlanApproverDecisionForRequesterParams) => {
      const createdAt = new Date();
      const id = `plan-appr-decision-${createdAt.getTime()}-${requesterUserId}`;
      const verb = decisionOutcomeVerb(outcome);
      const bodyLines = [
        `${approverName} ${verb} ${planLabel}.`,
        'Open Planning & Forecasting to review the outcome on the record.',
      ];
      if (notes?.trim()) {
        bodyLines.push(`Approver note: ${notes.trim()}`);
      }
      const title =
        outcome === 'rejected'
          ? 'Plan rejected'
          : outcome === 'approvedWithCondition'
            ? 'Plan approved with conditions'
            : 'Plan approved';

      setNotifications((prev) => [
        {
          id,
          recipientUserId: requesterUserId,
          kind: 'plan_approver_decision',
          title,
          body: bodyLines.join('\n\n'),
          createdAt,
          read: false,
        },
        ...prev,
      ]);
      setNotificationsPanelOpenRequest({ userId: requesterUserId, nonce: createdAt.getTime() });
    },
    []
  );

  const withdrawPlanApprovalNotifications = useCallback(() => {
    setNotifications((prev) => prev.filter((n) => n.kind !== 'plan_approval_request'));
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllReadForUser = useCallback((userId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.recipientUserId === userId ? { ...n, read: true } : n))
    );
  }, []);

  const value = useMemo(
    () => ({
      notifications,
      publishPlanApprovalRequested,
      publishPlanApproverDecisionForRequester,
      withdrawPlanApprovalNotifications,
      markNotificationRead,
      markAllReadForUser,
      notificationsPanelOpenRequest,
      consumeNotificationsPanelOpenRequest,
    }),
    [
      notifications,
      publishPlanApprovalRequested,
      publishPlanApproverDecisionForRequester,
      withdrawPlanApprovalNotifications,
      markNotificationRead,
      markAllReadForUser,
      notificationsPanelOpenRequest,
      consumeNotificationsPanelOpenRequest,
    ]
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return ctx;
}

export function formatNotificationTimestamp(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return 'a few seconds ago';
  const min = Math.floor(sec / 60);
  if (min < 60) return min <= 1 ? '1 minute ago' : `${min} minutes ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? '1 hour ago' : `${hr} hours ago`;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}
