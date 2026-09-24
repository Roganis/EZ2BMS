// Korean: see en/host.ts. Terms follow docs/i18n-glossary.md.
// A path or a name can end in any sound, so no particle follows {path} or
// {name}: the sentences put them before a colon or a fixed noun.

import type { host as en } from '../en/host';

export const host: Record<keyof typeof en, string> = {
  'host.not-ez2play': '{path}: EZ2PORT의 ez2play가 아닙니다 (ez2play의 옵션이 하나도 없습니다)',
  'host.changed': '{path}: 확인한 뒤에 바뀌었습니다. 다시 확인하세요',
  'host.stale': '{path}: 내보내기를 계획한 뒤에 바뀌었습니다. 계획을 다시 세우세요',
  'host.not-empty': '{path}: 폴더가 비어 있지 않습니다',
  'host.not-a-folder': '{path}: 폴더가 아닙니다',
  'host.no-backup': '이름이 {name}인 백업이 없습니다',
  'host.backup-exists': '이름이 {name}인 백업이 이미 있습니다',
  'host.exists': '{path}: 이미 있습니다',
  'host.not-a-file': '{path}: 파일이 아닙니다',
  'host.cannot-decode': '디코딩할 수 없습니다: {detail}',
  'host.audio-device': '오디오 장치: {detail}',
  'host.not-an-image': 'EZ2BMS가 읽을 수 있는 이미지(PNG, JPEG, BMP)가 아닙니다: {detail}',
  'host.not-an-image-file':
    '{path}: EZ2BMS가 읽을 수 있는 이미지(PNG, JPEG, BMP)가 아닙니다: {detail}',
  'host.image-too-large': '{w}x{h} 크기는 너무 큽니다 (한 변 최대 {max}픽셀)',
  'host.font-unreadable': '{path} 글꼴을 읽을 수 없습니다: {error}',
  'host.not-a-font': '{path}: EZ2BMS에서 쓸 수 있는 글꼴이 아닙니다',
  'host.no-cjk-font':
    '이 텍스트에는 CJK 글꼴이 필요하지만 설치된 글꼴이 없습니다 (scripts/fetch-fonts.mjs를 실행하세요)',
  'host.no-update': '설치할 업데이트가 없습니다. 먼저 업데이트를 확인하세요',
};
