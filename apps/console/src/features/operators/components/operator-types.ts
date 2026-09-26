import type { IssuedSession, OperatorSession } from '../api';

export type Credential = IssuedSession & { operatorId: string };
export type ConfirmTarget = { kind: 'operator' | 'session'; id: string } | null;
export type CredentialView = { operatorId: string; token: string; session: OperatorSession };
