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
  hcaptchaSiteKey: '' // hCaptcha desligado (era 'ee70c472-f97c-4b86-8216-a04e42d2e1e0'); desligar também em Supabase → Authentication → Attack Protection
};

/*
 * Ambiente de teste (à prova de erro): SÓ os endereços de produção abaixo usam o banco real.
 * Qualquer outro endereço (preview de branch do Vercel, link de deploy antigo, localhost) abre em modo demo,
 * com dados fictícios salvos só no navegador, e mostra a faixa "AMBIENTE DE TESTE". Assim dá para testar uma mudança
 * numa branch sem risco para os dados reais.
 * Se um dia o site ganhar domínio próprio, ADICIONE o endereço nesta lista; senão ele abre em modo teste.
 */
(function () {
  var PRODUCAO = ['prumogestao-lilac.vercel.app', 'prumogestao-lucas-projects-551525c8.vercel.app', 'prumogestao-git-main-lucas-projects-551525c8.vercel.app'];
  var host = location.hostname;
  if (PRODUCAO.indexOf(host) === -1) {
    window.PRUMO_CONFIG.mode = 'demo';
    window.PRUMO_CONFIG.testEnv = true;
    document.documentElement.classList.add('test-env');
  }
})();
