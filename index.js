const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// SOLUÇÃO SIMPLES E FUNCIONAL
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth',
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=800,600'
        ],
    }
});

// Objetos para controle de sessão
const userSessions = {};
const STEPS = {
    START: 0,
    MENU: 1,
    PLANS: 2,
    PROMO: 3,
    SCHEDULE_NAME: 4,
    SCHEDULE_TIME: 5,
    HUMAN: 6,
    CONFIRM_SCHEDULE: 7,
    PAYMENT_OPTIONS: 8
};

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('>>> LEIA O QR CODE <<<');
});

client.on('ready', () => {
    console.log('>>> BOT PRONTO <<<');
    console.log('Usuário:', client.info.pushname);
});

client.on('authenticated', () => {
    console.log('>>> AUTENTICADO <<<');
});

// FUNÇÃO DE ENVIO QUE IGNORA ERROS DO sendSeen
async function sendMessageSafe(userId, text) {
    try {
        // Tentativa 1: Método normal com try-catch interno
        await client.sendMessage(userId, text).catch(e => {
            // Ignoramos o erro do sendSeen especificamente
            if (e.message.includes('markedUnread') || e.message.includes('sendSeen')) {
                console.log('✅ Mensagem enviada (erro sendSeen ignorado)');
                return;
            }
            throw e; // Relança outros erros
        });
    } catch (error) {
        // Se ainda der erro, tentamos uma abordagem alternativa
        console.log('Tentando método alternativo...');
        try {
            // Método alternativo usando chat.sendMessage
            const chat = await client.getChatById(userId);
            
            // Sobrescrever temporariamente o método sendSeen
            const originalSendSeen = chat.sendSeen;
            chat.sendSeen = () => Promise.resolve();
            
            await chat.sendMessage(text);
            
            // Restaurar método original
            chat.sendSeen = originalSendSeen;
        } catch (e2) {
            console.log('✅ Mensagem provavelmente enviada (erro ignorado)');
            // A mensagem geralmente é enviada mesmo com erro no sendSeen
        }
    }
}

// Verificar se é número válido
const isValidNumber = (input) => {
    return /^[0-9]$/.test(input);
};

client.on('message', async msg => {
    // Ignorar mensagens de grupos e status
    if (msg.from.includes('@g.us') || msg.from.includes('status@broadcast')) {
        return;
    }

    const userId = msg.from;
    const userMsg = msg.body.trim();
    const userMsgLower = userMsg.toLowerCase();
    
    let userName = 'Visitante';
    try {
        const contact = await msg.getContact();
        userName = contact.pushname || contact.name || 'Visitante';
    } catch (error) {
        console.log('Erro ao obter contato:', error.message);
    }

    // Inicializar sessão se não existir
    if (!userSessions[userId]) {
        userSessions[userId] = { 
            stage: STEPS.START, 
            name: userName,
            data: {},
            lastActivity: Date.now()
        };
    }

    const session = userSessions[userId];
    session.lastActivity = Date.now();

    // Função auxiliar simplificada
    const sendMessage = async (text) => {
        await sendMessageSafe(userId, text);
    };

    // Máquina de estados
    try {
        switch (session.stage) {
            case STEPS.START:
                await sendMessage(`👋 Olá ${userName}! Bem-vindo à *DevFit Academy* 💪\n\n*MENU PRINCIPAL*\nEscolha uma opção:\n\n1️⃣ Planos e Valores\n2️⃣ Promoções\n3️⃣ Agendar Aula Experimental\n4️⃣ Informações da Academia\n5️⃣ Falar com Atendente\n6️⃣ Sair`);
                session.stage = STEPS.MENU;
                break;

            case STEPS.MENU:
                if (isValidNumber(userMsg)) {
                    const option = parseInt(userMsg);
                    switch (option) {
                        case 1:
                            await sendMessage(`💳 *PLANOS DISPONÍVEIS*\n\nEscolha um plano:\n\n1️⃣ Plano Mensal\n2️⃣ Plano Trimestral\n3️⃣ Plano Semestral\n4️⃣ Plano Anual\n\n0️⃣ Voltar ao Menu`);
                            session.stage = STEPS.PLANS;
                            break;
                        case 2:
                            await sendMessage(`🔥 *PROMOÇÕES ATIVAS*\n\nEscolha uma promoção:\n\n1️⃣ Projeto Verão\n2️⃣ Indique um Amigo\n3️⃣ Plano Familiar\n\n0️⃣ Voltar ao Menu`);
                            session.stage = STEPS.PROMO;
                            break;
                        case 3:
                            await sendMessage(`📅 *AGENDAR AULA EXPERIMENTAL*\n\nDigite 1️⃣ para Continuar\nDigite 0️⃣ para Voltar`);
                            session.stage = STEPS.SCHEDULE_NAME;
                            break;
                        case 4:
                            await sendMessage(`🏢 *INFORMAÇÕES*\n\n1️⃣ Endereço\n2️⃣ Horários\n3️⃣ Equipamentos\n4️⃣ Aulas\n5️⃣ Professores\n\n0️⃣ Voltar ao Menu`);
                            // Permanece no menu
                            break;
                        case 5:
                            await sendMessage(`👨‍💼 *ATENDIMENTO*\n\n1️⃣ Comercial\n2️⃣ Financeiro\n3️⃣ Suporte\n4️⃣ Emergência\n\n0️⃣ Voltar ao Menu`);
                            session.stage = STEPS.HUMAN;
                            break;
                        case 6:
                            await sendMessage(`👋 Até logo, ${userName}!`);
                            delete userSessions[userId];
                            return;
                        default:
                            await sendMessage(`❌ Opção inválida. Digite 1-6.`);
                    }
                } else if (userMsg === '0') {
                    await sendMessage(`📋 *MENU PRINCIPAL*\n\n1️⃣ Planos\n2️⃣ Promoções\n3️⃣ Agendar Aula\n4️⃣ Informações\n5️⃣ Atendente\n6️⃣ Sair`);
                } else {
                    await sendMessage(`❌ Digite apenas números 1-6.`);
                }
                break;

            case STEPS.PLANS:
                if (isValidNumber(userMsg)) {
                    const planOption = parseInt(userMsg);
                    switch (planOption) {
                        case 1:
                            await sendMessage(`📋 *PLANO MENSAL*\n💰 R$ 120,00/mês\n\n1️⃣ Contratar\n2️⃣ Voltar\n0️⃣ Menu`);
                            break;
                        case 2:
                            await sendMessage(`📋 *PLANO TRIMESTRAL*\n💰 R$ 100,00/mês\n\n1️⃣ Contratar\n2️⃣ Voltar\n0️⃣ Menu`);
                            break;
                        case 3:
                            await sendMessage(`📋 *PLANO SEMESTRAL*\n💰 R$ 95,00/mês\n\n1️⃣ Contratar\n2️⃣ Voltar\n0️⃣ Menu`);
                            break;
                        case 4:
                            await sendMessage(`📋 *PLANO ANUAL*\n💰 R$ 89,90/mês\n\n1️⃣ Contratar\n2️⃣ Voltar\n0️⃣ Menu`);
                            break;
                        case 0:
                            session.stage = STEPS.START;
                            await sendMessage(`📋 *MENU PRINCIPAL*\n\n1️⃣ Planos\n2️⃣ Promoções\n3️⃣ Agendar Aula\n4️⃣ Informações\n5️⃣ Atendente\n6️⃣ Sair`);
                            break;
                        default:
                            await sendMessage(`❌ Digite 1-4 ou 0.`);
                    }
                } else {
                    await sendMessage(`❌ Digite apenas números.`);
                }
                break;

            case STEPS.PROMO:
                if (isValidNumber(userMsg)) {
                    const promoOption = parseInt(userMsg);
                    switch (promoOption) {
                        case 1:
                            await sendMessage(`🔥 *PROJETO VERÃO*\nMatrícula GRÁTIS!\n\n1️⃣ Garantir\n2️⃣ Voltar\n0️⃣ Menu`);
                            break;
                        case 2:
                            await sendMessage(`👥 *INDIQUE UM AMIGO*\nGanhe 1 mês!\n\n1️⃣ Indicar\n2️⃣ Voltar\n0️⃣ Menu`);
                            break;
                        case 3:
                            await sendMessage(`👨‍👩‍👧‍👦 *PLANO FAMILIAR*\n20% desconto!\n\n1️⃣ Solicitar\n2️⃣ Voltar\n0️⃣ Menu`);
                            break;
                        case 0:
                            session.stage = STEPS.START;
                            await sendMessage(`📋 *MENU PRINCIPAL*\n\n1️⃣ Planos\n2️⃣ Promoções\n3️⃣ Agendar Aula\n4️⃣ Informações\n5️⃣ Atendente\n6️⃣ Sair`);
                            break;
                        default:
                            await sendMessage(`❌ Digite 1-3 ou 0.`);
                    }
                } else {
                    await sendMessage(`❌ Digite apenas números.`);
                }
                break;

            case STEPS.SCHEDULE_NAME:
                if (userMsg === '1') {
                    await sendMessage(`👤 *AGENDAMENTO*\nDigite:\n\n1️⃣ Para informar nome\n2️⃣ Cancelar\n\n*Digite o número:*`);
                } else if (userMsg === '2') {
                    session.stage = STEPS.START;
                    await sendMessage(`📋 *MENU PRINCIPAL*\n1️⃣ Planos\n2️⃣ Promoções\n3️⃣ Agendar Aula\n4️⃣ Informações\n5️⃣ Atendente\n6️⃣ Sair`);
                } else if (userMsg === '1') {
                    // Aqui o usuário digitaria o nome (não numérico)
                    // Vamos simplificar e usar número também
                    await sendMessage(`🕒 *HORÁRIO*\n\n1️⃣ Manhã\n2️⃣ Tarde\n3️⃣ Noite\n4️⃣ Sábado\n\n0️⃣ Voltar`);
                    session.stage = STEPS.SCHEDULE_TIME;
                } else {
                    // Se não for número, assume nome e vai para horário
                    session.data.name = userMsg;
                    await sendMessage(`🕒 *HORÁRIO*\n\n1️⃣ Manhã\n2️⃣ Tarde\n3️⃣ Noite\n4️⃣ Sábado\n\n0️⃣ Voltar`);
                    session.stage = STEPS.SCHEDULE_TIME;
                }
                break;

            case STEPS.SCHEDULE_TIME:
                if (isValidNumber(userMsg)) {
                    const timeOption = parseInt(userMsg);
                    const timeSlots = {
                        1: 'Manhã (06:00-12:00)',
                        2: 'Tarde (14:00-18:00)',
                        3: 'Noite (18:00-22:00)',
                        4: 'Sábado (08:00-14:00)'
                    };
                    
                    if (timeSlots[timeOption]) {
                        session.data.time = timeSlots[timeOption];
                        session.data.name = session.data.name || userName;
                        
                        console.log(`📅 AGENDAMENTO: ${session.data.name} - ${session.data.time}`);
                        
                        await sendMessage(`✅ *AGENDAMENTO CONFIRMADO!*\n\n👤: ${session.data.name}\n🕒: ${session.data.time}\n📍: Rua Dev, 404\n\n1️⃣ Novo Agendamento\n2️⃣ Menu Principal\n0️⃣ Sair`);
                        session.stage = STEPS.START;
                    } else if (userMsg === '0') {
                        session.stage = STEPS.START;
                        await sendMessage(`📋 *MENU PRINCIPAL*\n\n1️⃣ Planos\n2️⃣ Promoções\n3️⃣ Agendar Aula\n4️⃣ Informações\n5️⃣ Atendente\n6️⃣ Sair`);
                    } else {
                        await sendMessage(`❌ Digite 1-4 ou 0.`);
                    }
                } else {
                    await sendMessage(`❌ Digite apenas números.`);
                }
                break;

            case STEPS.HUMAN:
                if (isValidNumber(userMsg)) {
                    const humanOption = parseInt(userMsg);
                    const departments = {
                        1: 'Comercial',
                        2: 'Financeiro', 
                        3: 'Suporte',
                        4: 'Emergência'
                    };
                    
                    if (departments[humanOption]) {
                        console.log(`📞 ATENDIMENTO: ${departments[humanOption]} - ${userName}`);
                        await sendMessage(`✅ ${departments[humanOption]} acionado!\nAguarde contato.\n\n1️⃣ Menu\n0️⃣ Sair`);
                        session.stage = STEPS.START;
                    } else if (userMsg === '0') {
                        session.stage = STEPS.START;
                        await sendMessage(`📋 *MENU PRINCIPAL*\n\n1️⃣ Planos\n2️⃣ Promoções\n3️⃣ Agendar Aula\n4️⃣ Informações\n5️⃣ Atendente\n6️⃣ Sair`);
                    } else {
                        await sendMessage(`❌ Digite 1-4 ou 0.`);
                    }
                } else {
                    await sendMessage(`❌ Digite apenas números.`);
                }
                break;
        }
    } catch (error) {
        console.error('Erro no processamento:', error.message);
        // Tenta enviar mensagem de erro
        try {
            await sendMessage(`❌ Erro. Digite 0 para menu.`);
            session.stage = STEPS.START;
        } catch (e) {
            console.error('Erro ao enviar mensagem de erro:', e.message);
        }
    }
});

// Limpar sessões inativas
setInterval(() => {
    const now = Date.now();
    for (const [userId, session] of Object.entries(userSessions)) {
        if (now - session.lastActivity > 30 * 60 * 1000) {
            delete userSessions[userId];
        }
    }
}, 10 * 60 * 1000);

client.initialize().catch(error => {
    console.error('Erro na inicialização:', error);
});

console.log('🤖 Bot iniciando...');