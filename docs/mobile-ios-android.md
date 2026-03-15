# AcquaxControl no iPhone e Android

Este projeto já está preparado como **PWA** e pode ser usado como app em ambos os sistemas.

## 1) Instalação direta (sem loja)

### Android (Chrome)
1. Acesse o sistema pelo Chrome.
2. Toque em **Instalar aplicativo** (ou menu do navegador > Instalar app).
3. Confirme para criar o ícone na tela inicial.

### iPhone (Safari)
1. Acesse o sistema pelo Safari.
2. Toque em **Compartilhar**.
3. Toque em **Adicionar à Tela de Início**.
4. Confirme.

## 2) Publicar na Google Play e Apple App Store

### Pré-requisitos
- Produção com HTTPS (ex.: `https://www.acquaxcontrol.com.br`)
- `manifest.webmanifest` válido
- Service Worker ativo (`/sw.js`)
- Ícones e screenshots atualizados

### Android (Play Store)
Opção recomendada: **PWABuilder** (gera pacote Android/TWA)

Passos:
1. Acesse [https://www.pwabuilder.com](https://www.pwabuilder.com).
2. Informe a URL de produção do AcquaxControl.
3. Gere o pacote Android.
4. Abra no Android Studio, valide assinatura e versão.
5. Publique no Google Play Console.

### iOS (App Store)
Opção comum: empacotar a PWA em um app iOS com WKWebView (via PWABuilder ou wrapper equivalente).

Passos:
1. Gerar projeto iOS no PWABuilder.
2. Abrir no Xcode.
3. Configurar Team, Bundle Identifier e certificados.
4. Ajustar tela de splash e permissões conforme necessidade.
5. Enviar para App Store Connect.

## 3) Checklist de qualidade antes da loja

- [ ] Fluxo de login funcional no app instalado
- [ ] Ícone correto no Android/iOS
- [ ] Tema/status bar corretos
- [ ] Página offline funcionando (`/offline`)
- [ ] Performance mobile aceitável (Lighthouse)
- [ ] Política de privacidade acessível no app

## 4) Observação importante

Como este sistema usa autenticação e APIs dinâmicas, a estratégia mais simples é publicar um wrapper da PWA apontando para a URL de produção.
Isso permite manter uma única base de código para web, iPhone e Android.
