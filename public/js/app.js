// =====================
// FIREBASE CONFIG
// =====================
const firebaseConfig = {
  apiKey: "AIzaSyDFFyxOxtFCBZFiAKP-Arhy-7QLoKVJGTM",
  authDomain: "moda-express-5756b.firebaseapp.com",
  projectId: "moda-express-5756b",
  storageBucket: "moda-express-5756b.firebasestorage.app",
  messagingSenderId: "635739887957",
  appId: "1:635739887957:web:4d1a2a237fc50b3b50b7dc"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// =====================
// VARIÁVEIS
// =====================
let carrinho = [];
let usuarioLogado = null;
let pedidoAtual = null;
let monitorPagamento = null;

const areaProdutos = document.getElementById("produtos");
const areaInicio = document.getElementById("inicio");
const btnCarrinho = document.getElementById("btnCarrinho");
const modal = document.getElementById("modalCarrinho");
const fecharModal = document.getElementById("fecharModal");
const listaCarrinho = document.getElementById("listaCarrinho");
const totalSpan = document.getElementById("totalCarrinho");
const qtdCarrinho = document.getElementById("qtdCarrinho");
const finalizar = document.getElementById("finalizar");
const btnLogin = document.getElementById("btnLogin");
const areaPix = document.getElementById("areaPix");

// =====================
// CONFIGURAÇÃO PIX
// =====================
const CHAVE_PIX = "gustavonunes4533@gmail.com";
const NOME_RECEBEDOR = "ANGELO GUSTAVO DOS SANTOS SANTANA NUNES";
const CIDADE_RECEBEDOR = "ARACAJU";

// =====================
// MONITOR DE AUTENTICAÇÃO
// =====================
auth.onAuthStateChanged(user => {
  if (user) {
    usuarioLogado = user;
    btnLogin.innerHTML = `<img src="${user.photoURL}" class="icon-google" style="border-radius:50%"> ${user.displayName}`;
    console.log("Usuário logado:", user.displayName);
    
    // Monitora pedidos pendentes do usuário
    monitorarPedidosPendentes();
  } else {
    usuarioLogado = null;
    btnLogin.innerHTML = `<img src="images/google_small.png" class="icon-google"> Entrar`;
    
    // Para de monitorar quando faz logout
    if (monitorPagamento) {
      monitorPagamento();
      monitorPagamento = null;
    }
  }
  atualizarCarrinho();
});

// =====================
// LOGIN GOOGLE
// =====================
btnLogin.onclick = async () => {
  if (usuarioLogado) {
    await auth.signOut();
    alert("Logout realizado!");
    return;
  }

  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
    alert("Login realizado com sucesso!");
  } catch (err) {
    alert("Erro no login: " + err.message);
    console.error(err);
  }
};

// =====================
// GERADOR PIX CORRIGIDO - VERSÃO PROFISSIONAL
// =====================
function gerarPixCopiaECola(valor, pedidoId) {
  // Funções auxiliares
  function adicionarCampo(id, valor) {
    const tamanho = String(valor.length).padStart(2, '0');
    return id + tamanho + valor;
  }

  function calcularCRC16(payload) {
    let crc = 0xFFFF;
    
    for (let i = 0; i < payload.length; i++) {
      crc ^= (payload.charCodeAt(i) << 8);
      
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
        } else {
          crc = (crc << 1) & 0xFFFF;
        }
      }
    }
    
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function removerAcentos(texto) {
    return texto
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  // Prepara os dados (remove acentos e limita tamanhos)
  const nomeFormatado = removerAcentos(NOME_RECEBEDOR).substring(0, 25);
  const cidadeFormatada = removerAcentos(CIDADE_RECEBEDOR).substring(0, 15);
  const valorFormatado = valor.toFixed(2);

  let payload = '';
  
  // 00 - Payload Format Indicator
  payload += adicionarCampo('00', '01');
  
  // 26 - Merchant Account Information
  let merchantInfo = '';
  merchantInfo += adicionarCampo('00', 'br.gov.bcb.pix');
  merchantInfo += adicionarCampo('01', CHAVE_PIX);
  payload += adicionarCampo('26', merchantInfo);
  
  // 52 - Merchant Category Code
  payload += adicionarCampo('52', '0000');
  
  // 53 - Transaction Currency (986 = BRL)
  payload += adicionarCampo('53', '986');
  
  // 54 - Transaction Amount (sempre com 2 casas decimais)
  payload += adicionarCampo('54', valorFormatado);
  
  // 58 - Country Code
  payload += adicionarCampo('58', 'BR');
  
  // 59 - Merchant Name
  payload += adicionarCampo('59', nomeFormatado);
  
  // 60 - Merchant City
  payload += adicionarCampo('60', cidadeFormatada);
  
  // 62 - Additional Data Field Template (txid)
  let additionalData = '';
  additionalData += adicionarCampo('05', pedidoId.substring(0, 25));
  payload += adicionarCampo('62', additionalData);
  
  // 63 - CRC16 (calculado sobre todo o payload + "6304")
  payload += '6304';
  const crc = calcularCRC16(payload);
  payload += crc;
  
  console.log('✅ Código PIX gerado:', payload);
  console.log('📊 Detalhes:');
  console.log('  - Chave:', CHAVE_PIX);
  console.log('  - Nome:', nomeFormatado);
  console.log('  - Cidade:', cidadeFormatada);
  console.log('  - Valor:', valorFormatado);
  console.log('  - Pedido ID:', pedidoId.substring(0, 25));
  console.log('  - CRC16:', crc);
  
  return payload;
}

// =====================
// MONITORAMENTO DE PAGAMENTO
// =====================
function monitorarPedidosPendentes() {
  if (!usuarioLogado) return;
  
  // Monitora pedidos aguardando pagamento em tempo real
  monitorPagamento = db.collection("pedidos")
    .where("uid", "==", usuarioLogado.uid)
    .where("status", "==", "aguardando_pagamento")
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === "modified") {
          const pedido = change.doc.data();
          console.log("Pedido atualizado:", change.doc.id, pedido);
        }
      });
    });
}

function iniciarMonitoramentoPagamento(pedidoId) {
  console.log("🔍 Iniciando monitoramento do pedido:", pedidoId);
  
  const unsubscribe = db.collection("pedidos").doc(pedidoId)
    .onSnapshot(doc => {
      if (!doc.exists) return;
      
      const pedido = doc.data();
      console.log("📊 Status do pedido:", pedido.status);
      
      if (pedido.status === "pago") {
        // Pagamento confirmado!
        console.log("✅ PAGAMENTO CONFIRMADO!");
        unsubscribe(); // Para de monitorar
        
        mostrarPagamentoConfirmado(pedidoId, pedido);
      }
    });
  
  return unsubscribe;
}

function mostrarPagamentoConfirmado(pedidoId, pedido) {
  areaPix.innerHTML = `
    <div style="text-align: center; padding: 30px;">
      <div style="font-size: 80px; margin-bottom: 20px;">✅</div>
      <h3 style="color: #28a745; font-size: 28px; margin-bottom: 15px;">
        Pagamento Confirmado!
      </h3>
      <p style="font-size: 16px; color: #ddd; margin-bottom: 10px;">
        Seu pedido foi pago com sucesso!
      </p>
      <p style="font-size: 14px; color: #aaa;">
        Pedido: ${pedidoId}
      </p>
      <p style="font-size: 14px; color: #aaa; margin-bottom: 20px;">
        Total: R$ ${pedido.total.toFixed(2)}
      </p>
      <div style="background: #1a1a1a; padding: 20px; border-radius: 12px; margin-top: 20px;">
        <p style="color: #00ff99; font-size: 16px; margin-bottom: 10px;">
          🎉 Obrigado pela compra!
        </p>
        <p style="color: #ddd; font-size: 14px;">
          Em breve você receberá um e-mail com os detalhes do pedido.
        </p>
      </div>
    </div>
  `;
  
  // Notificação sonora (opcional)
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Pagamento Confirmado! 🎉', {
      body: `Seu pedido de R$ ${pedido.total.toFixed(2)} foi pago com sucesso!`,
      icon: 'images/logo.png'
    });
  }
  
  // Fecha modal após 5 segundos
  setTimeout(() => {
    modal.style.display = "none";
    alert("✅ Pagamento confirmado! Obrigado pela compra! 🎉");
  }, 5000);
}

// =====================
// SIMULAÇÃO DE PAGAMENTO (APENAS PARA TESTES)
// =====================
function simularPagamento(pedidoId) {
  // ATENÇÃO: Esta função é apenas para testes!
  // Em produção, o pagamento será confirmado via webhook do seu PSP
  
  console.log("⚠️ SIMULANDO pagamento para testes...");
  
  setTimeout(() => {
    db.collection("pedidos").doc(pedidoId).update({
      status: "pago",
      dataPagamento: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
      console.log("✅ Status do pedido atualizado para PAGO (simulação)");
    }).catch(err => {
      console.error("Erro ao atualizar status:", err);
    });
  }, 10000); // Simula pagamento após 10 segundos
}

// =====================
// PRODUTOS
// =====================
const produtos = [
  // CAMISAS (13)
  { id: 1, nome: "Camisa Urbana", preco: 79.9, categoria: "camisa", img: "images/camisa-urbana.png" },
  { id: 2, nome: "Camisa Básica Preta", preco: 59.9, categoria: "camisa", img: "images/camisa-basica-preta.png" },
  { id: 3, nome: "Camisa Branca Premium", preco: 69.9, categoria: "camisa", img: "images/camisa-branca-premium.png" },
  { id: 4, nome: "Camisa Street Azul", preco: 89.9, categoria: "camisa", img: "images/camisa-street-azul.png" },
  { id: 5, nome: "Camisa Longline", preco: 99.9, categoria: "camisa", img: "images/camisa-longline.png" },
  { id: 6, nome: "Camisa Minimal", preco: 74.9, categoria: "camisa", img: "images/camisa-minimal.png" },
  { id: 7, nome: "Camisa Grafite", preco: 84.9, categoria: "camisa", img: "images/camisa-grafite.png" },
  { id: 8, nome: "Camisa Vintage", preco: 92.9, categoria: "camisa", img: "images/camisa-vintage.png" },
  { id: 9, nome: "Camisa Casual", preco: 65.9, categoria: "camisa", img: "images/camisa-casual.png" },
  { id: 10, nome: "Camisa Dark", preco: 88.9, categoria: "camisa", img: "images/camisa-dark.png" },
  { id: 11, nome: "Camisa Slim", preco: 71.9, categoria: "camisa", img: "images/camisa-slim.png" },
  { id: 12, nome: "Camisa Estampada", preco: 95.9, categoria: "camisa", img: "images/camisa-estampada.png" },
  { id: 13, nome: "Camisa Fashion", preco: 109.9, categoria: "camisa", img: "images/camisa-fashion.png" },

  // CALÇAS (13)
  { id: 14, nome: "Calça Jeans Skinny", preco: 129.9, categoria: "calca", img: "images/calca-jeans-skinny.png" },
  { id: 15, nome: "Calça Cargo", preco: 139.9, categoria: "calca", img: "images/calca-cargo.png" },
  { id: 16, nome: "Calça Moletom", preco: 119.9, categoria: "calca", img: "images/calca-moletom.png" },
  { id: 17, nome: "Calça Street", preco: 149.9, categoria: "calca", img: "images/calca-street.png" },
  { id: 18, nome: "Calça Slim", preco: 134.9, categoria: "calca", img: "images/calca-slim.png" },
  { id: 19, nome: "Calça Preta", preco: 124.9, categoria: "calca", img: "images/calca-preta.png" },
  { id: 20, nome: "Calça Azul", preco: 119.9, categoria: "calca", img: "images/calca-azul.png" },
  { id: 21, nome: "Calça Casual", preco: 129.9, categoria: "calca", img: "images/calca-casual.png" },
  { id: 22, nome: "Calça Premium", preco: 159.9, categoria: "calca", img: "images/calca-premium.png" },
  { id: 23, nome: "Calça Sport", preco: 109.9, categoria: "calca", img: "images/calca-sport.png" },
  { id: 24, nome: "Calça Moderna", preco: 144.9, categoria: "calca", img: "images/calca-moderna.png" },
  { id: 25, nome: "Calça Flex", preco: 134.9, categoria: "calca", img: "images/calca-flex.png" },
  { id: 26, nome: "Calça Urban", preco: 149.9, categoria: "calca", img: "images/calca-urban.png" },

  // MOLETONS (13)
  { id: 27, nome: "Moletom Preto", preco: 169.9, categoria: "moletom", img: "images/moletom-preto.png" },
  { id: 28, nome: "Moletom Cinza", preco: 159.9, categoria: "moletom", img: "images/moletom-cinza.png" },
  { id: 29, nome: "Moletom Street", preco: 179.9, categoria: "moletom", img: "images/moletom-street.png" },
  { id: 30, nome: "Moletom Premium", preco: 199.9, categoria: "moletom", img: "images/moletom-premium.png" },
  { id: 31, nome: "Moletom Azul", preco: 164.9, categoria: "moletom", img: "images/moletom-azul.png" },
  { id: 32, nome: "Moletom Casual", preco: 154.9, categoria: "moletom", img: "images/moletom-casual.png" },
  { id: 33, nome: "Moletom Moderno", preco: 189.9, categoria: "moletom", img: "images/moletom-moderno.png" },
  { id: 34, nome: "Moletom Fashion", preco: 209.9, categoria: "moletom", img: "images/moletom-fashion.png" },
  { id: 35, nome: "Moletom Branco", preco: 169.9, categoria: "moletom", img: "images/moletom-branco.png" },
  { id: 36, nome: "Moletom Urban", preco: 179.9, categoria: "moletom", img: "images/moletom-urban.png" },
  { id: 37, nome: "Moletom Clean", preco: 149.9, categoria: "moletom", img: "images/moletom-clean.png" },
  { id: 38, nome: "Moletom Dark", preco: 189.9, categoria: "moletom", img: "images/moletom-dark.png" },
  { id: 39, nome: "Moletom Oversized", preco: 199.9, categoria: "moletom", img: "images/moletom-oversized.png" },

  // SAPATOS (13)
  { id: 40, nome: "Tênis Street", preco: 249.9, categoria: "sapato", img: "images/tenis-street.png" },
  { id: 41, nome: "Tênis Urbano", preco: 229.9, categoria: "sapato", img: "images/tenis-urbano.png" },
  { id: 42, nome: "Tênis Premium", preco: 299.9, categoria: "sapato", img: "images/tenis-premium.png" },
  { id: 43, nome: "Tênis Casual", preco: 209.9, categoria: "sapato", img: "images/tenis-casual.png" },
  { id: 44, nome: "Tênis Esportivo", preco: 239.9, categoria: "sapato", img: "images/tenis-esportivo.png" },
  { id: 45, nome: "Tênis Basico", preco: 279.9, categoria: "sapato", img: "images/tenis-basico.png" },
  { id: 46, nome: "Tênis Fashion", preco: 259.9, categoria: "sapato", img: "images/tenis-fashion.png" },
  { id: 47, nome: "Tênis Minimal", preco: 219.9, categoria: "sapato", img: "images/tenis-minimal.png" },
  { id: 48, nome: "Sapatênis", preco: 189.9, categoria: "sapato", img: "images/sapatenis.png" },
  { id: 49, nome: "Tênis Moderno", preco: 269.9, categoria: "sapato", img: "images/tenis-moderno.png" },
  { id: 50, nome: "Tênis Classic", preco: 229.9, categoria: "sapato", img: "images/tenis-classic.png" },
  { id: 51, nome: "Tênis Branco", preco: 199.9, categoria: "sapato", img: "images/tenis-branco.png" },
  { id: 52, nome: "Tênis Preto", preco: 209.9, categoria: "sapato", img: "images/tenis-preto.png" }
];

// =====================
// FILTRAR PRODUTOS
// =====================
function filtrar(cat) {
  if (cat === "todos") {
    areaInicio.style.display = "block";
    areaProdutos.style.display = "none";
    return;
  }

  areaInicio.style.display = "none";
  areaProdutos.style.display = "grid";

  const filtrado = produtos.filter(p => p.categoria === cat);
  areaProdutos.innerHTML = "";

  filtrado.forEach(p => {
    const div = document.createElement("div");
    div.className = "produto";
    div.innerHTML = `
      <img src="${p.img}" alt="${p.nome}" class="img-produto">
      <h3>${p.nome}</h3>
      <p>R$ ${p.preco.toFixed(2)}</p>
      <button onclick="adicionar(${p.id})">Adicionar</button>
    `;
    areaProdutos.appendChild(div);
  });
}

// =====================
// CARRINHO
// =====================
function adicionar(id) {
  const prod = produtos.find(p => p.id === id);
  if (prod) {
    carrinho.push(prod);
    qtdCarrinho.textContent = carrinho.length;
    alert(`${prod.nome} adicionado ao carrinho!`);
    atualizarCarrinho();
  }
}

btnCarrinho.onclick = () => {
  modal.style.display = "flex";
};

fecharModal.onclick = () => {
  modal.style.display = "none";
};

function atualizarCarrinho() {
  listaCarrinho.innerHTML = "";
  let total = 0;

  carrinho.forEach((item, i) => {
    total += item.preco;
    const li = document.createElement("li");
    li.innerHTML = `
      ${item.nome} - R$ ${item.preco.toFixed(2)}
      <button onclick="remover(${i})">Remover</button>
    `;
    listaCarrinho.appendChild(li);
  });

  totalSpan.textContent = total.toFixed(2);

  finalizar.disabled = !usuarioLogado || carrinho.length === 0;

  if (!usuarioLogado) {
    finalizar.textContent = "Faça login para finalizar";
  } else {
    finalizar.textContent = "Finalizar Pedido";
  }
}

function remover(index) {
  carrinho.splice(index, 1);
  qtdCarrinho.textContent = carrinho.length;
  atualizarCarrinho();
}

// =====================
// FINALIZAR + PIX + QR CODE
// =====================
finalizar.onclick = async () => {
  if (!usuarioLogado) {
    alert("Faça login com sua conta Google para continuar.");
    return;
  }

  if (carrinho.length === 0) {
    alert("Seu carrinho está vazio!");
    return;
  }

  finalizar.disabled = true;
  finalizar.textContent = "Processando...";

  try {
    if (!navigator.geolocation) {
      throw new Error("Geolocalização não suportada pelo navegador.");
    }

    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const total = carrinho.reduce((s, i) => s + i.preco, 0);

        const pedidoRef = await db.collection("pedidos").add({
          cliente: usuarioLogado.displayName,
          email: usuarioLogado.email,
          uid: usuarioLogado.uid,
          itens: carrinho.map(item => ({
            id: item.id,
            nome: item.nome,
            preco: item.preco,
            categoria: item.categoria
          })),
          total: total,
          localizacao: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          },
          pagamento: "PIX",
          status: "aguardando_pagamento",
          data: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log("✅ Pedido criado:", pedidoRef.id);
        pedidoAtual = pedidoRef.id;

        // Gera código PIX CORRIGIDO
        const pixCopiaECola = gerarPixCopiaECola(total, pedidoRef.id);
        
        const pixInfo = `🎯 PAGAMENTO VIA PIX

📱 Destinatário: ${NOME_RECEBEDOR}
🔑 Chave: ${CHAVE_PIX}
💰 Valor: R$ ${total.toFixed(2)}
🌆 Cidade: ${CIDADE_RECEBEDOR}
📦 Pedido: ${pedidoRef.id}

👇 Copie o código abaixo ou escaneie o QR Code`;

        areaPix.innerHTML = "";

        const titulo = document.createElement("h3");
        titulo.textContent = "🎉 Pedido Realizado com Sucesso!";
        titulo.style.color = "#28a745";
        titulo.style.marginBottom = "10px";
        
        const subtitulo = document.createElement("p");
        subtitulo.textContent = "Pague usando PIX:";
        subtitulo.style.marginBottom = "20px";
        subtitulo.style.fontSize = "14px";
        
        // Status de aguardando pagamento
        const statusDiv = document.createElement("div");
        statusDiv.id = "statusPagamento";
        statusDiv.style.background = "#fff3cd";
        statusDiv.style.border = "2px solid #ffc107";
        statusDiv.style.borderRadius = "8px";
        statusDiv.style.padding = "12px";
        statusDiv.style.marginBottom = "15px";
        statusDiv.innerHTML = `
          <p style="color: #856404; margin: 0; font-weight: bold;">
            ⏳ Aguardando pagamento...
          </p>
        `;
        
        const qrContainer = document.createElement("div");
        qrContainer.id = "qrcode";
        qrContainer.style.margin = "20px auto";
        qrContainer.style.display = "inline-block";
        qrContainer.style.padding = "15px";
        qrContainer.style.background = "white";
        qrContainer.style.borderRadius = "12px";
        qrContainer.style.boxShadow = "0 4px 15px rgba(0,0,0,0.3)";
        
        const infoTexto = document.createElement("p");
        infoTexto.textContent = pixInfo;
        infoTexto.style.fontSize = "13px";
        infoTexto.style.color = "#ddd";
        infoTexto.style.marginTop = "20px";
        infoTexto.style.whiteSpace = "pre-line";
        infoTexto.style.textAlign = "left";
        infoTexto.style.background = "#1a1a1a";
        infoTexto.style.padding = "15px";
        infoTexto.style.borderRadius = "8px";
        infoTexto.style.border = "1px solid #333";
        
        const textarea = document.createElement("textarea");
        textarea.id = "pixTexto";
        textarea.value = pixCopiaECola;
        textarea.readOnly = true;
        textarea.style.width = "100%";
        textarea.style.height = "110px";
        textarea.style.marginTop = "15px";
        textarea.style.padding = "12px";
        textarea.style.fontFamily = "monospace";
        textarea.style.fontSize = "10px";
        textarea.style.border = "2px solid #333";
        textarea.style.borderRadius = "8px";
        textarea.style.wordBreak = "break-all";
        textarea.style.background = "#0a0a0a";
        textarea.style.color = "#00ff99";
        
        const btnCopiar = document.createElement("button");
        btnCopiar.textContent = "📋 Copiar Código PIX";
        btnCopiar.style.marginTop = "15px";
        btnCopiar.style.padding = "14px 28px";
        btnCopiar.style.background = "linear-gradient(135deg, #28a745, #20c997)";
        btnCopiar.style.color = "white";
        btnCopiar.style.border = "none";
        btnCopiar.style.borderRadius = "8px";
        btnCopiar.style.cursor = "pointer";
        btnCopiar.style.fontSize = "15px";
        btnCopiar.style.fontWeight = "bold";
        btnCopiar.style.width = "100%";
        btnCopiar.style.transition = "all 0.3s";
        
        btnCopiar.onclick = () => {
          textarea.select();
          document.execCommand("copy");
          btnCopiar.textContent = "✅ Código Copiado!";
          btnCopiar.style.background = "linear-gradient(135deg, #20c997, #17a2b8)";
          setTimeout(() => {
            btnCopiar.textContent = "📋 Copiar Código PIX";
            btnCopiar.style.background = "linear-gradient(135deg, #28a745, #20c997)";
          }, 3000);
        };

        btnCopiar.onmouseover = () => {
          btnCopiar.style.transform = "translateY(-2px)";
          btnCopiar.style.boxShadow = "0 6px 20px rgba(40, 167, 69, 0.4)";
        };
        
        btnCopiar.onmouseout = () => {
          btnCopiar.style.transform = "translateY(0)";
          btnCopiar.style.boxShadow = "none";
        };

        // Botão para simular pagamento (APENAS PARA TESTES)
        const btnSimular = document.createElement("button");
        btnSimular.textContent = "🧪 Simular Pagamento (TESTE)";
        btnSimular.style.marginTop = "10px";
        btnSimular.style.padding = "10px";
        btnSimular.style.background = "linear-gradient(135deg, #ff9800, #ff5722)";
        btnSimular.style.color = "white";
        btnSimular.style.border = "none";
        btnSimular.style.borderRadius = "8px";
        btnSimular.style.cursor = "pointer";
        btnSimular.style.fontSize = "13px";
        btnSimular.style.fontWeight = "bold";
        btnSimular.style.width = "100%";
        btnSimular.onclick = () => {
          simularPagamento(pedidoRef.id);
          btnSimular.disabled = true;
          btnSimular.textContent = "⏳ Simulando pagamento em 10s...";
        };

        areaPix.appendChild(titulo);
        areaPix.appendChild(subtitulo);
        areaPix.appendChild(statusDiv);
        areaPix.appendChild(qrContainer);
        areaPix.appendChild(infoTexto);
        areaPix.appendChild(textarea);
        areaPix.appendChild(btnCopiar);
        areaPix.appendChild(btnSimular); // REMOVER EM PRODUÇÃO

        // Gera QR Code
        new QRCode(qrContainer, {
          text: pixCopiaECola,
          width: 220,
          height: 220,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });

        // Inicia monitoramento do pagamento em tempo real
        iniciarMonitoramentoPagamento(pedidoRef.id);

        carrinho = [];
        qtdCarrinho.textContent = "0";
        atualizarCarrinho();

        alert(`✅ Pedido criado!\n\nPague R$ ${total.toFixed(2)} via PIX: ${CHAVE_PIX}\n\n⏳ O pagamento será detectado automaticamente!`);

      } catch (error) {
        console.error("Erro ao criar pedido:", error);
        alert("❌ Erro ao processar pedido: " + error.message);
        finalizar.disabled = false;
        finalizar.textContent = "Finalizar Pedido";
      }
    }, 
    error => {
      console.error("Erro de geolocalização:", error);
      alert("⚠️ Não foi possível obter sua localização.\nVerifique as permissões do navegador.");
      finalizar.disabled = false;
      finalizar.textContent = "Finalizar Pedido";
    });

  } catch (error) {
    console.error("Erro:", error);
    alert("❌ Erro: " + error.message);
    finalizar.disabled = false;
    finalizar.textContent = "Finalizar Pedido";
  }
};
