export const DEVICE_SPECS = {
  x4: { name: "Xteink X4", width: 480, height: 800 },
  x3: { name: "Xteink X3", width: 528, height: 792 },
} as const

export type DeviceType = keyof typeof DEVICE_SPECS

export const FONT_FAMILIES: Record<string, { variants: { file: string; url: string }[]; isVariable?: boolean }> = {
  Literata: {
    variants: [
      { file: "Literata-Regular.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/literata/Literata%5Bopsz%2Cwght%5D.ttf" },
      { file: "Literata-Italic.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/literata/Literata-Italic%5Bopsz%2Cwght%5D.ttf" },
    ],
    isVariable: true,
  },
  Lora: {
    variants: [
      { file: "Lora-Regular.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lora/Lora%5Bwght%5D.ttf" },
      { file: "Lora-Italic.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lora/Lora-Italic%5Bwght%5D.ttf" },
    ],
    isVariable: true,
  },
  Merriweather: {
    variants: [
      { file: "Merriweather-Regular.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/merriweather/Merriweather-Regular.ttf" },
      { file: "Merriweather-Bold.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/merriweather/Merriweather-Bold.ttf" },
      { file: "Merriweather-Italic.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/merriweather/Merriweather-Italic.ttf" },
      { file: "Merriweather-BoldItalic.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/merriweather/Merriweather-BoldItalic.ttf" },
    ],
  },
  "Open Sans": {
    variants: [
      { file: "OpenSans-Regular.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/opensans/OpenSans%5Bwdth%2Cwght%5D.ttf" },
      { file: "OpenSans-Italic.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/opensans/OpenSans-Italic%5Bwdth%2Cwght%5D.ttf" },
    ],
    isVariable: true,
  },
  "Source Serif 4": {
    variants: [
      { file: "SourceSerif4-Regular.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sourceserif4/SourceSerif4%5Bopsz%2Cwght%5D.ttf" },
      { file: "SourceSerif4-Italic.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sourceserif4/SourceSerif4-Italic%5Bopsz%2Cwght%5D.ttf" },
    ],
    isVariable: true,
  },
  "Noto Sans": {
    variants: [
      { file: "NotoSans-Regular.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf" },
      { file: "NotoSans-Italic.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/NotoSans-Italic%5Bwdth%2Cwght%5D.ttf" },
    ],
    isVariable: true,
  },
  "Noto Serif": {
    variants: [
      { file: "NotoSerif-Regular.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notoserif/NotoSerif%5Bwdth%2Cwght%5D.ttf" },
      { file: "NotoSerif-Italic.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notoserif/NotoSerif-Italic%5Bwdth%2Cwght%5D.ttf" },
    ],
    isVariable: true,
  },
  Roboto: {
    variants: [
      { file: "Roboto-Regular.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf" },
      { file: "Roboto-Italic.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/roboto/Roboto-Italic%5Bwdth%2Cwght%5D.ttf" },
    ],
    isVariable: true,
  },
  "EB Garamond": {
    variants: [
      { file: "EBGaramond-Regular.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf" },
      { file: "EBGaramond-Italic.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ebgaramond/EBGaramond-Italic%5Bwght%5D.ttf" },
    ],
    isVariable: true,
  },
  "Crimson Pro": {
    variants: [
      { file: "CrimsonPro-Regular.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/crimsonpro/CrimsonPro%5Bwght%5D.ttf" },
      { file: "CrimsonPro-Italic.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/crimsonpro/CrimsonPro-Italic%5Bwght%5D.ttf" },
    ],
    isVariable: true,
  },
  "Noto Sans Georgian": {
    variants: [
      { file: "NotoSansGeorgian-Regular.ttf", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosansgeorgian/NotoSansGeorgian%5Bwdth%2Cwght%5D.ttf" },
    ],
    isVariable: true,
  },
}

export const ARABIC_FONTS = [
  { file: "NotoNaskhArabic-Regular.ttf", url: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-Regular.ttf" },
  { file: "NotoNaskhArabic-Medium.ttf", url: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-Medium.ttf" },
  { file: "NotoNaskhArabic-SemiBold.ttf", url: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-SemiBold.ttf" },
  { file: "NotoNaskhArabic-Bold.ttf", url: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-Bold.ttf" },
]

export const LANG_TO_PATTERN: Record<string, string> = {
  hy: "Armenian.pattern", eu: "Basque.pattern", bg: "Bulgarian.pattern",
  ca: "Catalan.pattern", cs: "Czech.pattern", da: "Danish.pattern",
  nl: "Dutch.pattern", "en-gb": "English_GB.pattern", en: "English_US.pattern",
  eo: "Esperanto.pattern", et: "Estonian.pattern", fi: "Finnish.pattern",
  fr: "French.pattern", fur: "Friulian.pattern", gl: "Galician.pattern",
  ka: "Georgian.pattern", de: "German.pattern", el: "Greek.pattern",
  hr: "Croatian.pattern", hu: "Hungarian.pattern", is: "Icelandic.pattern",
  ga: "Irish.pattern", it: "Italian.pattern", la: "Latin.pattern",
  lv: "Latvian.pattern", lt: "Lithuanian.pattern", mk: "Macedonian.pattern",
  no: "Norwegian.pattern", oc: "Occitan.pattern", pms: "Piedmontese.pattern",
  pl: "Polish.pattern", "pt-br": "Portuguese_BR.pattern", pt: "Portuguese.pattern",
  ro: "Romanian.pattern", rm: "Romansh.pattern", ru: "Russian.pattern",
  sr: "Serbian.pattern", sk: "Slovak.pattern", sl: "Slovenian.pattern",
  es: "Spanish.pattern", sv: "Swedish.pattern", tr: "Turkish.pattern",
  uk: "Ukrainian.pattern", cy: "Welsh.pattern", zu: "Zulu.pattern",
}
