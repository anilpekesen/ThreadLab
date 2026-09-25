const tr = {
  subjectAndMessageRequired: "Konu ve mesaj gereklidir.",
  messageEmpty: "Mesaj boş olamaz.",
  quickTitle: "Bize hemen ulaşın",
  quickText: "Kurulumda takıldıysanız ya da ilk ürününüzü birlikte kurmak isterseniz ücretsiz yardımcı oluyoruz. Talepler bize anında iletilir.",
  whatsapp: "WhatsApp'tan yaz",
  whatsappGreeting: (shop: string) => `Merhaba, PrintLab için yazıyorum. Mağazam: ${shop}`,
  onboardingTitle: "İlk ürününüzü birlikte kuralım",
  onboardingText: "Ücretsiz kurulum desteği: baskı alanını, fiyatları ve ilk şablonunuzu sizinle birlikte ayarlıyoruz. Size nasıl ulaşalım?",
  onboardingShort: "Ücretsiz kurulum desteği: baskı alanını, fiyatları ve ilk şablonunuzu sizinle birlikte ayarlıyoruz.",
  onboardingContact: "Telefon ya da WhatsApp (isteğe bağlı)",
  onboardingNote: "Ne satmak istiyorsunuz? Uygun olduğunuz saatler? (isteğe bağlı)",
  onboardingSubmit: "Kurulum desteği iste",
  onboardingSubject: "Kurulum desteği: ilk ürünü birlikte kuralım",
  onboardingDone: "Talebiniz bize ulaştı. En kısa sürede size dönüyoruz; yanıtı bu sayfada da görebilirsiniz.",
  onboardingEmptyMessage: "Merchant ilk ürününü birlikte kurmak istiyor.",
};

const en: typeof tr = {
  subjectAndMessageRequired: "Subject and message are required.",
  messageEmpty: "Message can't be empty.",
  quickTitle: "Reach us right away",
  quickText: "Stuck on setup, or want to set up your first product together? We help for free. Requests reach us instantly.",
  whatsapp: "Message us on WhatsApp",
  whatsappGreeting: (shop) => `Hi, I'm writing about PrintLab. My store: ${shop}`,
  onboardingTitle: "Let's set up your first product together",
  onboardingText: "Free setup help: we configure the print area, pricing and your first template with you. How should we reach you?",
  onboardingShort: "Free setup help: we configure the print area, pricing and your first template with you.",
  onboardingContact: "Phone or WhatsApp (optional)",
  onboardingNote: "What do you want to sell? Times that suit you? (optional)",
  onboardingSubmit: "Request setup help",
  onboardingSubject: "Setup help: set up the first product together",
  onboardingDone: "We got your request and will get back to you shortly; you'll also see the reply on this page.",
  onboardingEmptyMessage: "The merchant wants to set up their first product together.",
};

export default { tr, en };
