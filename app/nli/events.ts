export const NLI_RPC_EVENTS = {
  approve: 'nli approve',
  cancel: 'nli cancel',
  cancelLogin: 'nli cancel login',
  clarify: 'nli clarify',
  edit: 'nli edit',
  login: 'nli login',
  logout: 'nli logout',
  privacy: 'nli privacy',
  resetPrivacy: 'nli reset privacy',
  reject: 'nli reject',
  retry: 'nli retry',
  status: 'nli status',
  authState: 'nli auth state',
  focusTerminal: 'nli terminal focus',
  setup: 'nli setup req',
  state: 'nli state'
} as const;

export const NLI_SESSION_EVENTS = {
  shellSemantic: 'nli shell semantic'
} as const;
