/*
 * Prumo — configuração do ambiente
 *
 * mode: 'demo'      → dados fictícios salvos só neste navegador (para testes e apresentações)
 *       'supabase'  → banco de dados e login reais no Supabase (produção)
 *
 * Para produção, preencha com os dados do seu projeto (Supabase → Project Settings → API):
 *   supabaseUrl      → Project URL (ex.: https://abcdefghijkl.supabase.co)
 *   supabaseAnonKey  → chave "anon public". Ela pode ficar no site: a segurança vem das regras (RLS)
 *                      do banco. NUNCA coloque aqui a chave "service_role".
 *   siteUrl          → endereço público do site (usado nos links de convite e de nova senha)
 */
window.PRUMO_CONFIG = {
  mode: 'supabase',
  supabaseUrl: 'https://vspmjifkkahswtqfasii.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzcG1qaWZra2Foc3d0cWZhc2lpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0Nzg0NTIsImV4cCI6MjEwNzA1NDQ1Mn0.QknOCeSc8l-BHIvP5teDNK63-ZlhOeSobiSRTtaeyGw',
  // endereço público do site (preencha quando publicar; enquanto vazio, usa o endereço atual da página)
  siteUrl: '',
  companyName: '2S Consultoria e Serviços',
  // hCaptcha no login, "esqueci a senha" e cadastro por convite. Cole aqui a "Site Key" (pública) do painel do hCaptcha.
  // A "Secret Key" NÃO vai aqui: ela é colada no Supabase → Authentication → Attack Protection → Enable Captcha protection.
  // Enquanto vazio, o captcha fica desligado.
  hcaptchaSiteKey: 'ee70c472-f97c-4b86-8216-a04e42d2e1e0'
};
