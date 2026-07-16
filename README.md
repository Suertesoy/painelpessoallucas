# 📊 Painel Pessoal Lucas

Este repositório foi configurado para hospedar o **Painel Pessoal Lucas**, estruturado para integração contínua e deploy simplificado na **Vercel**.

---

## 🚀 Como Conectar este Repositório à Vercel

Siga os passos abaixo para realizar o deploy do seu painel pessoal na Vercel a partir deste repositório do GitHub:

### 1. Preparar o Repositório Local
Antes de conectar à Vercel, certifique-se de que os arquivos do seu projeto (como `index.html`, arquivos de estilo CSS, scripts JS, ou arquivos de configuração de frameworks como Next.js ou React) estejam adicionados e commitados no repositório.

Para criar o seu primeiro commit e enviar as alterações para o GitHub, execute no terminal:
```bash
# Adicionar todos os arquivos ao Git
git add .

# Criar o commit inicial
git commit -m "Initial commit: Configuração inicial e README"

# Garantir que a branch principal se chama main
git branch -M main

# Enviar para o GitHub
git push -u origin main
```

### 2. Importar o Projeto na Vercel
1. Acesse o painel da [Vercel](https://vercel.com) e faça login com a sua conta do GitHub.
2. Clique no botão **"Add New..."** no canto superior direito e selecione **"Project"**.
3. Na lista de repositórios do seu GitHub, localize o repositório **`painelpessoallucas`** e clique em **"Import"**.

### 3. Configurar o Deploy
Durante a importação na Vercel, ajuste as seguintes configurações:
- **Project Name:** `painelpessoallucas` (ou outro nome de sua preferência)
- **Framework Preset:** Se você estiver utilizando HTML/CSS/JS puro, selecione **"Other"**. Se estiver utilizando frameworks (como Next.js, Vite/React, Vue, etc.), a Vercel detectará automaticamente.
- **Root Directory:** `./` (diretório raiz do repositório)
- **Build and Output Settings:** Caso utilize HTML/JS puro, não é necessário alterar nada. Para frameworks, a Vercel preenche os comandos corretos automaticamente.
- **Environment Variables (Opcional):** Se o seu painel consumir APIs que exigem chaves secretas, adicione-as aqui.

Após conferir as configurações, clique em **"Deploy"**.

### 4. Deploy Automático (CI/CD)
Uma vez conectado, **toda vez que você fizer um `git push`** para a branch `main` no GitHub, a Vercel irá:
1. Detectar as novas alterações automaticamente.
2. Executar o build do projeto (se necessário).
3. Publicar a nova versão online em segundos, fornecendo uma URL pública de produção.

---

## 🛠️ Tecnologias Recomendadas
Para o desenvolvimento do seu painel pessoal, sugerimos:
- **HTML5 & CSS3** (com variáveis CSS e design responsivo).
- **JavaScript (Vanilla)** para controle de lógica e interações dinâmicas.
- **Integração com APIs** de terceiros (ex: clima, calendário, tarefas, finanças).

---

## 📄 Licença
Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes (caso aplicável).
