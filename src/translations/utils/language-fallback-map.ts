/**
 * Language fallback mapping
 * Maps unsupported language codes to their fallback alternatives
 * Format: unsupported_code -> [fallback_1, fallback_2, ...]
 */
export const LANGUAGE_FALLBACK_MAP: Record<string, string[]> = {
  // German variants
  de_at: ['de'], // Austrian German -> German
  de_ch: ['de'], // Swiss German -> German
  de_de: ['de'], // Standard German -> German

  // English variants
  en_gb: ['en'], // British English -> English
  en_us: ['en'], // American English -> English
  en_au: ['en'], // Australian English -> English
  en_ca: ['en'], // Canadian English -> English
  en_nz: ['en'], // New Zealand English -> English

  // Chinese variants (Hong Kong, Taiwan -> Traditional)
  zh_hk: ['zh_hant', 'zh'], // Hong Kong Chinese -> Traditional Chinese -> Chinese
  zh_tw: ['zh_hant', 'zh'], // Taiwan Chinese -> Traditional Chinese -> Chinese
  zh_mo: ['zh_hant', 'zh'], // Macau Chinese -> Traditional Chinese -> Chinese

  // Chinese variants (Mainland, Singapore -> Simplified)
  zh_cn: ['zh_hans', 'zh'], // Mainland Chinese -> Simplified Chinese -> Chinese
  zh_sg: ['zh_hans', 'zh'], // Singapore Chinese -> Simplified Chinese -> Chinese

  // Portuguese variants
  pt_pt: ['pt'], // European Portuguese -> Portuguese
  pt_ao: ['pt'], // Angolan Portuguese -> Portuguese
  pt_mz: ['pt'], // Mozambican Portuguese -> Portuguese

  // Spanish variants (Latin America)
  es_mx: ['es_419', 'es'], // Mexican Spanish -> Latin American Spanish -> Spanish
  es_ar: ['es_419', 'es'], // Argentine Spanish -> Latin American Spanish -> Spanish
  es_co: ['es_419', 'es'], // Colombian Spanish -> Latin American Spanish -> Spanish
  es_cl: ['es_419', 'es'], // Chilean Spanish -> Latin American Spanish -> Spanish
  es_pe: ['es_419', 'es'], // Peruvian Spanish -> Latin American Spanish -> Spanish
  es_ve: ['es_419', 'es'], // Venezuelan Spanish -> Latin American Spanish -> Spanish
  es_ec: ['es_419', 'es'], // Ecuadorian Spanish -> Latin American Spanish -> Spanish
  es_gt: ['es_419', 'es'], // Guatemalan Spanish -> Latin American Spanish -> Spanish
  es_cu: ['es_419', 'es'], // Cuban Spanish -> Latin American Spanish -> Spanish
  es_do: ['es_419', 'es'], // Dominican Spanish -> Latin American Spanish -> Spanish
  es_hn: ['es_419', 'es'], // Honduran Spanish -> Latin American Spanish -> Spanish
  es_ni: ['es_419', 'es'], // Nicaraguan Spanish -> Latin American Spanish -> Spanish
  es_sv: ['es_419', 'es'], // Salvadoran Spanish -> Latin American Spanish -> Spanish
  es_cr: ['es_419', 'es'], // Costa Rican Spanish -> Latin American Spanish -> Spanish
  es_pa: ['es_419', 'es'], // Panamanian Spanish -> Latin American Spanish -> Spanish
  es_uy: ['es_419', 'es'], // Uruguayan Spanish -> Latin American Spanish -> Spanish
  es_py: ['es_419', 'es'], // Paraguayan Spanish -> Latin American Spanish -> Spanish
  es_bo: ['es_419', 'es'], // Bolivian Spanish -> Latin American Spanish -> Spanish

  // Spanish (European)
  es_es: ['es'], // European Spanish -> Spanish

  // French variants
  fr_ca: ['fr'], // Canadian French -> French
  fr_ch: ['fr'], // Swiss French -> French
  fr_be: ['fr'], // Belgian French -> French
  fr_fr: ['fr'], // Standard French -> French

  // Norwegian variants
  no: ['nb'], // Norwegian -> Norwegian Bokmål
  nn: ['nb'], // Norwegian Nynorsk -> Norwegian Bokmål

  // Other regional variants
  it_ch: ['it'], // Swiss Italian -> Italian
  nl_be: ['nl'], // Belgian Dutch (Flemish) -> Dutch
  sv_fi: ['sv'], // Finland Swedish -> Swedish
  ar_ae: ['ar'], // UAE Arabic -> Arabic
  ar_sa: ['ar'], // Saudi Arabic -> Arabic
  ar_eg: ['ar'] // Egyptian Arabic -> Arabic
};
