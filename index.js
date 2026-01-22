const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Configuração do cliente
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth',
    }),
    puppeteer: {
        headless: false, // MUDAR PARA false PARA VER O NAVEGADOR
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ],
    }
});

const userSessions = {};
const STEPS = {
    START: 0,
    MENU: 1,
    PLANS: 2,
    PROMO: 3,
    SCHEDULE: 4,
    HUMAN: 5
};

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('>>> LEIA O QR CODE <<<');
});

client.on('ready', async () => {
    console.log('>>> BOT PRONTO <<<');
    
    // APLICAR PATCH DIRETO NO NAVEGADOR
    try {
        await client.pupPage.evaluate(() => {
            // Patch 1: Sobrescrever WWebJS.sendSeen
            if (window.WWebJS) {
                const originalSendSeen = window.WWebJS.sendSeen;
                window.WWebJS.sendSeen = function() {
                    return Promise.resolve(); // Retorna promessa vazia
                };
                console.log('Patch WWebJS aplicado');
            }
            
            // Patch 2: Sobrescrever Store.Msg.sendSeen
            if (window.Store && window.Store.Msg && window.Store.Msg.sendSeen) {
                window.Store.Msg.sendSeen = function() {
                    return Promise.resolve();
                };
                console.log('Patch Store.Msg aplicado');
            }
            
            // Patch 3: Sobrescrever Store.sendSeen se existir
            if (window.Store && window.Store.sendSeen) {
                window.Store.sendSeen = function() {
                    return Promise.resolve();
                };
                console.log('Patch Store.sendSeen aplicado');
            }
        });
        console.log('✅ Todos os patches aplicados com sucesso!');
    } catch (error) {
        console.log('⚠️ Alguns patches não foram aplicados:', error.message);
    }
});

client.on('authenticated', () => {
    console.log('>>> AUTENTICADO <<<');
});

// FUNÇÃO DE ENVIO SUPER SIMPLES E EFICAZ
async function enviarComCerteza(userId, texto) {
    console.log(`📤 Tentando enviar para ${userId}: "${texto.substring(0, 30)}..."`);
    
    // MÉTODO 1: Usando client.sendMessage com timeout
    try {
        // Usamos Promise.race para timeout
        const envio = client.sendMessage(userId, texto);
        const timeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
        );
        
        await Promise.race([envio, timeout]);
        console.log('✅ Mensagem enviada (Método 1)');
        return;
    } catch (error1) {
        console.log('❌ Método 1 falhou:', error1.message);
    }
    
    // MÉTODO 2: Usando chat.sendMessage
    try {
        const chat = await client.getChatById(userId);
        console.log('Chat encontrado, enviando...');
        await chat.sendMessage(texto);
        console.log('✅ Mensagem enviada (Método 2)');
        return;
    } catch (error2) {
        console.log('❌ Método 2 falhou:', error2.message);
    }
    
    // MÉTODO 3: Injeção direta JavaScript
    try {
        await client.pupPage.evaluate(async (id, msg) => {
            // Encontrar o chat
            const chat = await window.Store.Chat.find(id);
            if (chat) {
                // Enviar mensagem
                await chat.sendMessage(msg);
                return true;
            }
            return false;
        }, userId, texto);
        console.log('✅ Mensagem enviada (Método 3)');
        return;
    } catch (error3) {
        console.log('❌ Método 3 falhou:', error3.message);
    }
    
    // MÉTODO 4: Última tentativa - ignorar completamente erros
    try {
        // Simplesmente tenta enviar sem se importar com erros
        await client.sendMessage(userId, texto).catch(() => {});
        console.log('✅ Mensagem (provavelmente) enviada (Método 4)');
    } catch (error4) {
        console.log('❌ Todos os métodos falharam');
    }
}

// Função para enviar com delay (evita flood)
const enviarComDelay = (() => {
    let ultimoEnvio = 0;
    const delayMinimo = 1000; // 1 segundo entre mensagens
    
    return async (userId, texto) => {
        const agora = Date.now();
        const tempoEspera = ultimoEnvio + delayMinimo - agora;
        
        if (tempoEspera > 0) {
            console.log(`⏳ Aguardando ${tempoEspera}ms...`);
            await new Promise(resolve => setTimeout(resolve, tempoEspera));
        }
        
        await enviarComCerteza(userId, texto);
        ultimoEnvio = Date.now();
    };
})();

client.on('message', async msg => {
    // Log detalhado
    console.log('\n══════════════════════════════════════');
    console.log(`📩 NOVA MENSAGEM RECEBIDA:`);
    console.log(`👤 De: ${msg.from}`);
    console.log(`💬 Texto: "${msg.body}"`);
    console.log(`⏰ Hora: ${new Date().toLocaleTimeString()}`);
    
    // Ignorar grupos
    if (msg.from.includes('@g.us')) {
        console.log('⏭️  Ignorando (grupo)');
        return;
    }
    
    // Ignorar status
    if (msg.from.includes('status@broadcast')) {
        console.log('⏭️  Ignorando (status)');
        return;
    }
    
    const userId = msg.from;
    const textoRecebido = msg.body.trim();
    const textoMinusculo = textoRecebido.toLowerCase();
    
    // Obter nome do usuário
    let nomeUsuario = 'Cliente';
    try {
        const contato = await msg.getContact();
        nomeUsuario = contato.pushname || contato.name || 'Cliente';
        console.log(`👋 Usuário: ${nomeUsuario}`);
    } catch (error) {
        console.log('⚠️  Não consegui obter nome do contato');
    }
    
    // Inicializar/recuperar sessão
    if (!userSessions[userId]) {
        userSessions[userId] = {
            etapa: STEPS.START,
            nome: nomeUsuario,
            data: {},
            ultimaInteracao: Date.now(),
            historico: []
        };
        console.log(`🆕 Nova sessão criada para ${nomeUsuario}`);
    }
    
    const sessao = userSessions[userId];
    sessao.ultimaInteracao = Date.now();
    sessao.historico.push({ entrada: textoRecebido, hora: new Date() });
    
    // Verificar se é número
    const ehNumero = /^[0-9]$/.test(textoRecebido);
    const opcaoNumero = ehNumero ? parseInt(textoRecebido) : null;
    
    // Função auxiliar para enviar
    const enviar = async (texto) => {
        console.log(`📤 RESPONDENDO: "${texto.substring(0, 50)}..."`);
        await enviarComDelay(userId, texto);
    };
    
    // PROCESSAR COM BASE NA ETAPA
    try {
        switch (sessao.etapa) {
            case STEPS.START:
                await enviar(`👋 *OLÁ ${nomeUsuario.toUpperCase()}!* 😊\n\nSou o assistente virtual da *DEV FIT ACADEMY*! 💪\n\n*MENU PRINCIPAL* 📋\n\n*Digite o número da opção desejada:*\n\n1️⃣  PLANOS E VALORES\n2️⃣  PROMOÇÕES ESPECIAIS\n3️⃣  AGENDAR AULA EXPERIMENTAL\n4️⃣  INFORMAÇÕES DA ACADEMIA\n5️⃣  FALAR COM ATENDENTE\n\n👉 *EXEMPLO: Digite "1" para ver nossos planos*`);
                sessao.etapa = STEPS.MENU;
                break;
                
            case STEPS.MENU:
                if (ehNumero && opcaoNumero >= 1 && opcaoNumero <= 5) {
                    switch (opcaoNumero) {
                        case 1:
                            await enviar(`💪 *NOSSOS PLANOS* 💰\n\n*Digite o número do plano que deseja conhecer:*\n\n1️⃣  PLANO MENSAL - R$ 120,00\n2️⃣  PLANO TRIMESTRAL - R$ 100,00/mês\n3️⃣  PLANO SEMESTRAL - R$ 95,00/mês\n4️⃣  PLANO ANUAL - R$ 89,90/mês (25% OFF!)\n\n0️⃣  VOLTAR AO MENU PRINCIPAL`);
                            sessao.etapa = STEPS.PLANS;
                            break;
                        case 2:
                            await enviar(`🔥 *PROMOÇÕES ATIVAS* 🎁\n\n*Escolha uma promoção:*\n\n1️⃣  PROJETO VERÃO - Matrícula GRÁTIS!\n2️⃣  INDICAÇÃO PREMIADA - Ganhe 1 mês!\n3️⃣  PLANO DUPLO - 20% de desconto!\n\n0️⃣  VOLTAR AO MENU PRINCIPAL`);
                            sessao.etapa = STEPS.PROMO;
                            break;
                        case 3:
                            await enviar(`📅 *AGENDAR AULA EXPERIMENTAL* 🏋️‍♂️\n\n*Digite:*\n\n1️⃣  PARA AGENDAR AGORA\n2️⃣  VER HORÁRIOS DISPONÍVEIS\n\n0️⃣  VOLTAR AO MENU PRINCIPAL`);
                            sessao.etapa = STEPS.SCHEDULE;
                            break;
                        case 4:
                            await enviar(`🏢 *INFORMAÇÕES DA ACADEMIA* 📍\n\n📍 *Endereço:* Rua dos Atletas, 123 - Centro\n\n⏰ *Horário de Funcionamento:*\n• Segunda a Sexta: 6h às 23h\n• Sábados: 8h às 20h\n• Domingos: 9h às 14h\n\n🏋️‍♂️ *Estrutura:*\n• 200+ equipamentos\n• 3 salas de aula\n• Piscina semi-olímpica\n• Estacionamento gratuito\n\n0️⃣  VOLTAR AO MENU PRINCIPAL`);
                            break;
                        case 5:
                            await enviar(`👨‍💼 *ATENDIMENTO HUMANO* 📞\n\nUm de nossos consultores entrará em contato em breve!\n\n📞 *Telefone:* (11) 9999-9999\n📧 *E-mail:* contato@devfit.com.br\n\n⏳ *Tempo de resposta:* até 2 horas úteis\n\n0️⃣  VOLTAR AO MENU PRINCIPAL`);
                            sessao.etapa = STEPS.HUMAN;
                            break;
                    }
                } else if (textoRecebido === '0') {
                    await enviar(`📋 *MENU PRINCIPAL*\n\n1️⃣  PLANOS E VALORES\n2️⃣  PROMOÇÕES ESPECIAIS\n3️⃣  AGENDAR AULA EXPERIMENTAL\n4️⃣  INFORMAÇÕES DA ACADEMIA\n5️⃣  FALAR COM ATENDENTE`);
                    sessao.etapa = STEPS.START;
                } else {
                    await enviar(`❌ *OPÇÃO INVÁLIDA!*\n\nPor favor, digite apenas números de 1 a 5.\n\n*EXEMPLOS:*\n• Digite "1" para Planos\n• Digite "2" para Promoções\n• Digite "3" para Agendar Aula\n• Digite "4" para Informações\n• Digite "5" para Atendente Humano\n\n0️⃣  PARA REPETIR O MENU`);
                }
                break;
                
            case STEPS.PLANS:
                if (ehNumero) {
                    switch (opcaoNumero) {
                        case 1:
                            await enviar(`📋 *PLANO MENSAL*\n\n✅ Acesso ilimitado à academia\n✅ Uso de todos equipamentos\n✅ Aulas em grupo inclusas\n✅ Área de musculação e cardio\n\n💰 *Valor:* R$ 120,00/mês\n\n1️⃣  CONTRATAR ESTE PLANO\n2️⃣  FALAR COM VENDEDOR\n0️⃣  VOLTAR`);
                            break;
                        case 2:
                            await enviar(`📋 *PLANO TRIMESTRAL*\n\n✅ Todos benefícios do plano mensal\n✅ Economia de 16%\n✅ Renovação automática\n✅ 1 avaliação física gratuita\n\n💰 *Valor:* R$ 100,00/mês (R$ 300,00 total)\n\n1️⃣  CONTRATAR ESTE PLANO\n2️⃣  FALAR COM VENDEDOR\n0️⃣  VOLTAR`);
                            break;
                        case 3:
                            await enviar(`📋 *PLANO SEMESTRAL*\n\n✅ Economia de 20%\n✅ Upgrade gratuito após 3 meses\n✅ 2 meses de academia online\n✅ 2 avaliações físicas\n\n💰 *Valor:* R$ 95,00/mês (R$ 570,00 total)\n\n1️⃣  CONTRATAR ESTE PLANO\n2️⃣  FALAR COM VENDEDOR\n0️⃣  VOLTAR`);
                            break;
                        case 4:
                            await enviar(`📋 *PLANO ANUAL*\n\n✅ Economia de 25%\n✅ Matrícula GRÁTIS\n✅ 3 meses de academia online\n✅ Assessoria nutricional\n✅ 4 avaliações físicas\n✅ Cadeira de massagem\n\n💰 *Valor:* R$ 89,90/mês (R$ 1.078,80 total)\n\n1️⃣  CONTRATAR ESTE PLANO\n2️⃣  FALAR COM VENDEDOR\n0️⃣  VOLTAR`);
                            break;
                        case 0:
                            sessao.etapa = STEPS.START;
                            await enviar(`📋 *MENU PRINCIPAL*\n\n1️⃣  PLANOS E VALORES\n2️⃣  PROMOÇÕES ESPECIAIS\n3️⃣  AGENDAR AULA EXPERIMENTAL\n4️⃣  INFORMAÇÕES DA ACADEMIA\n5️⃣  FALAR COM ATENDENTE`);
                            break;
                        default:
                            await enviar(`❌ Digite um número de 1 a 4 ou 0 para voltar.`);
                    }
                } else {
                    await enviar(`❌ Por favor, digite apenas números.`);
                }
                break;
                
            case STEPS.PROMO:
                if (ehNumero) {
                    switch (opcaoNumero) {
                        case 1:
                            await enviar(`🎉 *PROJETO VERÃO CONFIRMADO!*\n\n✅ Matrícula totalmente GRÁTIS!\n✅ Plano anual com desconto máximo\n✅ Kit boas-vindas (toalha + squeeze)\n\n📅 *Válido até:* 31/12/2024\n\n1️⃣  QUERO GARANTIR ESTA OFERTA!\n2️⃣  FALAR COM CONSULTOR\n0️⃣  VOLTAR`);
                            break;
                        case 2:
                            await enviar(`👥 *INDICAÇÃO PREMIADA*\n\nIndique um amigo e ambos ganham:\n✅ 1 mês GRÁTIS na mensalidade!\n✅ Acesso VIP por 30 dias\n\n1️⃣  QUERO INDICAR UM AMIGO\n2️⃣  MAIS DETALHES\n0️⃣  VOLTAR`);
                            break;
                        case 3:
                            await enviar(`👨‍👩‍👧‍👦 *PLANO DUPLO/FAMILIAR*\n\n20% de desconto para:\n✅ Casais\n✅ Famílias\n✅ Amigos (mínimo 2 pessoas)\n\n1️⃣  SOLICITAR ORÇAMENTO\n2️⃣  CONDIÇÕES\n0️⃣  VOLTAR`);
                            break;
                        case 0:
                            sessao.etapa = STEPS.START;
                            await enviar(`📋 *MENU PRINCIPAL*\n\n1️⃣  PLANOS E VALORES\n2️⃣  PROMOÇÕES ESPECIAIS\n3️⃣  AGENDAR AULA EXPERIMENTAL\n4️⃣  INFORMAÇÕES DA ACADEMIA\n5️⃣  FALAR COM ATENDENTE`);
                            break;
                        default:
                            await enviar(`❌ Digite 1, 2, 3 ou 0.`);
                    }
                } else {
                    await enviar(`❌ Digite apenas números.`);
                }
                break;
                
            case STEPS.SCHEDULE:
                if (ehNumero) {
                    if (opcaoNumero === 1) {
                        await enviar(`📅 *AGENDAMENTO RÁPIDO*\n\n*Escolha um horário:*\n\n1️⃣  SEGUNDA - 9:00 às 10:00\n2️⃣  TERÇA - 14:00 às 15:00\n3️⃣  QUARTA - 18:00 às 19:00\n4️⃣  QUINTA - 10:00 às 11:00\n5️⃣  SEXTA - 16:00 às 17:00\n6️⃣  SÁBADO - 11:00 às 12:00\n\n0️⃣  VOLTAR`);
                    } else if (opcaoNumero === 2) {
                        await enviar(`⏰ *HORÁRIOS DISPONÍVEIS*\n\n📅 *Próximas vagas:*\n• Amanhã: 9h, 14h, 18h\n• Quarta-feira: 10h, 16h\n• Sexta-feira: 9h, 15h, 19h\n\n1️⃣  AGENDAR AGORA\n0️⃣  VOLTAR`);
                    } else if (opcaoNumero >= 1 && opcaoNumero <= 6) {
                        const horarios = [
                            'SEGUNDA - 9:00 às 10:00',
                            'TERÇA - 14:00 às 15:00',
                            'QUARTA - 18:00 às 19:00',
                            'QUINTA - 10:00 às 11:00',
                            'SEXTA - 16:00 às 17:00',
                            'SÁBADO - 11:00 às 12:00'
                        ];
                        
                        console.log(`📅 AULA AGENDADA: ${nomeUsuario} - ${horarios[opcaoNumero-1]} - ${userId}`);
                        
                        await enviar(`✅ *AULA EXPERIMENTAL AGENDADA!*\n\n👤 *Nome:* ${nomeUsuario}\n📅 *Data/Horário:* ${horarios[opcaoNumero-1]}\n📍 *Local:* Rua dos Atletas, 123\n📞 *Telefone:* (11) 9999-9999\n\n⚠️ *Recomendações:*\n• Chegar 15 minutos antes\n• Trazer RG ou CPF\n• Usar roupas confortáveis\n• Trazer toalha de rosto\n\n*Estamos ansiosos para recebê-lo!* 🏋️‍♂️`);
                        
                        sessao.etapa = STEPS.START;
                    } else if (opcaoNumero === 0) {
                        sessao.etapa = STEPS.START;
                        await enviar(`📋 *MENU PRINCIPAL*\n\n1️⃣  PLANOS E VALORES\n2️⃣  PROMOÇÕES ESPECIAIS\n3️⃣  AGENDAR AULA EXPERIMENTAL\n4️⃣  INFORMAÇÕES DA ACADEMIA\n5️⃣  FALAR COM ATENDENTE`);
                    } else {
                        await enviar(`❌ Opção inválida. Digite 1, 2 ou 0.`);
                    }
                } else {
                    await enviar(`❌ Digite apenas números.`);
                }
                break;
                
            case STEPS.HUMAN:
                if (textoRecebido === '0') {
                    sessao.etapa = STEPS.START;
                    await enviar(`📋 *MENU PRINCIPAL*\n\n1️⃣  PLANOS E VALORES\n2️⃣  PROMOÇÕES ESPECIAIS\n3️⃣  AGENDAR AULA EXPERIMENTAL\n4️⃣  INFORMAÇÕES DA ACADEMIA\n5️⃣  FALAR COM ATENDENTE`);
                } else {
                    console.log(`📞 ATENDIMENTO SOLICITADO: ${nomeUsuario} - ${userId}`);
                    await enviar(`✅ *SOLICITAÇÃO REGISTRADA!*\n\nUm de nossos consultores entrará em contato em breve.\n\n📞 *Contato alternativo:* (11) 9999-9999\n⏳ *Tempo médio de resposta:* 1-2 horas úteis\n\n0️⃣  VOLTAR AO MENU`);
                }
                break;
        }
    } catch (error) {
        console.error('❌ ERRO NO PROCESSAMENTO:', error);
        try {
            await enviar(`😕 *Desculpe, ocorreu um erro.*\n\nPor favor, digite "0" para voltar ao menu principal.`);
            sessao.etapa = STEPS.START;
        } catch (e) {
            console.error('❌ ERRO AO ENVIAR MENSAGEM DE ERRO:', e);
        }
    }
    
    console.log('══════════════════════════════════════\n');
});

// Limpar sessões inativas (30 minutos)
setInterval(() => {
    const agora = Date.now();
    const limite = 30 * 60 * 1000; // 30 minutos
    
    for (const [userId, sessao] of Object.entries(userSessions)) {
        if (agora - sessao.ultimaInteracao > limite) {
            console.log(`🗑️  Removendo sessão inativa: ${userId}`);
            delete userSessions[userId];
        }
    }
}, 10 * 60 * 1000); // Verificar a cada 10 minutos

// Inicializar
client.initialize().catch(error => {
    console.error('❌ ERRO NA INICIALIZAÇÃO:', error);
});

console.log('🚀 Bot inicializando...');
console.log('📝 Configure o WhatsApp Web no seu celular:');
console.log('   WhatsApp → ⋮ (Menu) → Dispositivos conectados → Conectar um dispositivo');
console.log('⏳ Aguardando QR Code...');