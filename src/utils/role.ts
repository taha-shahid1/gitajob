const TECH_ROLE_PATTERNS = [
  /\bsoftware\b/i,
  /\bdeveloper\b/i,
  /\bengineer(?:ing)?\b/i,
  /\bfull[-\s]?stack\b/i,
  /\bfrontend\b/i,
  /\bbackend\b/i,
  /\bdevops\b/i,
  /\bsre\b/i,
  /\bsite reliability\b/i,
  /\bplatform\b/i,
  /\binfra(?:structure)?\b/i,
  /\bsystems?\b/i,
  /\bnetwork(?:ing)?\b/i,
  /\bdatabase\b/i,
  /\bcloud\b/i,
  /\bqa\b/i,
  /\btest(?:ing)?\b/i,
  /\bautomation\b/i,
  /\bsecurity\b/i,
  /\bcyber\b/i,
  /\bdata\b/i,
  /\banalytics?\b/i,
  /\bmachine learning\b/i,
  /\bml\b/i,
  /\bartificial intelligence\b/i,
  /\bai\b/i,
  /\bllm\b/i,
  /\bcomputer vision\b/i,
  /\brobotics?\b/i,
  /\bfirmware\b/i,
  /\bembedded\b/i,
  /\bfpga\b/i,
  /\bgis\b/i,
  /\bit\b/i,
  /\btechnical\b/i,
  /\bapplications?\b/i,
]

const NON_TECH_ROLE_PATTERNS = [
  /\bmarketing\b/i,
  /\bculinary\b/i,
  /\bmeats?\b/i,
  /\bpoultry\b/i,
  /\bpartnerships?\b/i,
  /\bproduct manager\b/i,
  /\bstaffing\b/i,
  /\bcoordinator\b/i,
]

export function isTechnicalRole(role: string): boolean {
  if (!TECH_ROLE_PATTERNS.some(pattern => pattern.test(role))) return false
  if (NON_TECH_ROLE_PATTERNS.some(pattern => pattern.test(role))) return false
  return true
}
