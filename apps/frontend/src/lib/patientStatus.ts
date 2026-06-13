export const STATUS_COLOR: Record<string, string> = {
  CRITICAL: 'error',
  PENDING:  'warning',
  STABLE:   'success',
  MISSING:  'blue',
};

export const STATUS_LABEL: Record<string, string> = {
  CRITICAL: 'L1 ฉุกเฉินวิกฤติ',
  PENDING:  'L2 ฉุกเฉินเร่งด่วน',
  STABLE:   'L3 ไม่เร่งด่วน',
  MISSING:  'L4 ทั่วไป',
};

export const STATUS_OPTIONS = [
  { value: 'CRITICAL', label: 'L1 ฉุกเฉินวิกฤติ' },
  { value: 'PENDING',  label: 'L2 ฉุกเฉินเร่งด่วน' },
  { value: 'STABLE',   label: 'L3 ไม่เร่งด่วน' },
  { value: 'MISSING',  label: 'L4 ทั่วไป' },
];
