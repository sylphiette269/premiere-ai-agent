const GENERATED_VERIFICATION_SEGMENTS = [
  '/premiere-fade-verify-',
  '/fade_check/',
  '/_premiere_out/fade_check/',
];

function normalizeGuardPath(filePath: string): string {
  return String(filePath || '').replace(/\\/g, '/').toLowerCase();
}

export function isGeneratedVerificationArtifactPath(filePath: string): boolean {
  const normalizedPath = normalizeGuardPath(filePath);
  return GENERATED_VERIFICATION_SEGMENTS.some((segment) => normalizedPath.includes(segment));
}

export function getGeneratedVerificationArtifactImportError(filePath: string): string | null {
  if (!isGeneratedVerificationArtifactPath(filePath)) {
    return null;
  }

  return [
    'generated_verification_artifact_not_allowed',
    'Verification frame exports must not be imported as Premiere project media.',
    `path=${filePath}`,
  ].join(': ');
}
