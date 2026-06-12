/* @ds-bundle: {"format":3,"namespace":"ShopperDesignSystem_93bf5d","components":[],"sourceHashes":{"ui_kits/app/BottomSheets.jsx":"325406ea13a7","ui_kits/app/Components.jsx":"e036aa980e36","ui_kits/app/ios-frame.jsx":"d67eb3ffe562","ui_kits/web/Components.jsx":"58c1ca75c3f4"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.ShopperDesignSystem_93bf5d = window.ShopperDesignSystem_93bf5d || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// ui_kits/app/BottomSheets.jsx
try { (() => {
// BottomSheets & Modals — Shopper Design System
// 4 patterns from real app screenshots (IMG_0172–0175)
// Fonts: Montserrat (UI), Raleway (marketing headlines)

const BS = {
  green: '#0DAB77',
  greenDark: '#07A776',
  greenLight: '#E8F5EE',
  freshGreen: '#85CE2B',
  freshGreenDark: '#6AA820',
  navy: '#002D62',
  navyDeep: '#001540',
  pet: '#F2749E',
  petLight: '#FDE8F0',
  fg1: '#1A1A1A',
  fg2: '#444',
  fg3: '#888',
  border: '#E8E8E8',
  bg: '#fff',
  red: '#D01F31'
};

// Shared drag handle
function DragHandle() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 4,
      borderRadius: 2,
      background: '#D0D0D0',
      margin: '12px auto 0'
    }
  });
}

// Shared close button (×)
function CloseBtn({
  color = '#D01F31',
  onClose
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: 'transparent',
      border: 0,
      color,
      fontSize: 22,
      fontWeight: 700,
      cursor: 'pointer',
      lineHeight: 1,
      padding: 4
    }
  }, "\xD7");
}

// Shared overlay wrapper
function Overlay({
  children,
  onClick
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(0,0,0,.45)',
      display: 'flex',
      alignItems: 'flex-end',
      zIndex: 100
    },
    onClick: onClick
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: '100%'
    }
  }, children));
}

// Shared modal wrapper (centered)
function ModalOverlay({
  children,
  onClick
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(0,0,0,.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: 20
    },
    onClick: onClick
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: '100%',
      background: BS.bg,
      borderRadius: 16,
      overflow: 'hidden'
    }
  }, children));
}

// ── Pattern 1: Marketing bottom sheet (pet cashback) ────────
// Raleway ExtraBold headline, Montserrat body, inline colored text
function PetCashbackSheet({
  onClose
}) {
  return /*#__PURE__*/React.createElement(Overlay, {
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: BS.bg,
      borderRadius: '24px 24px 0 0',
      maxHeight: '90vh',
      overflowY: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#EAF5EE',
      padding: '16px 20px 24px',
      position: 'relative',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(DragHandle, null), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 16,
      right: 16
    }
  }, /*#__PURE__*/React.createElement(CloseBtn, {
    onClose: onClose
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 160,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 140,
      height: 140,
      borderRadius: '50%',
      background: 'rgba(0,150,100,.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "80",
    height: "80",
    viewBox: "0 0 80 80"
  }, /*#__PURE__*/React.createElement("ellipse", {
    cx: "40",
    cy: "55",
    rx: "24",
    ry: "18",
    fill: "#E8D5C4"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "40",
    cy: "32",
    r: "16",
    fill: "#C8A882"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "30",
    cy: "26",
    rx: "7",
    ry: "10",
    fill: "#A07850",
    transform: "rotate(-15 30 26)"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "50",
    cy: "26",
    rx: "7",
    ry: "10",
    fill: "#A07850",
    transform: "rotate(15 50 26)"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "35",
    cy: "34",
    r: "2.5",
    fill: "#4A3728"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "45",
    cy: "34",
    r: "2.5",
    fill: "#4A3728"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "56",
    cy: "62",
    rx: "14",
    ry: "12",
    fill: "#F4A0B0"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "56",
    cy: "56",
    r: "8",
    fill: "#F4A0B0"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "62",
    cy: "55",
    r: "2",
    fill: "#E87090"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "53",
    y: "52",
    width: "6",
    height: "2",
    rx: "1",
    fill: "#D06080"
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 20px 28px'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'Raleway',
      fontWeight: 800,
      fontSize: 24,
      color: BS.green,
      lineHeight: 1.2,
      margin: '0 0 16px'
    }
  }, "Ganhe 10% de cashback, em todas as compras!"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 14,
      color: BS.fg2,
      lineHeight: 1.6,
      margin: '0 0 12px'
    }
  }, "Todas as suas compras na ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: BS.pet,
      fontWeight: 700
    }
  }, "Pet.Shopper"), " geram ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: BS.green,
      fontWeight: 700
    }
  }, "10% de cashback"), " para voc\xEA fazer seu mercado de forma inteligente."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 14,
      color: BS.fg2,
      lineHeight: 1.6,
      margin: '0 0 12px'
    }
  }, "Al\xE9m de economizar com a ra\xE7\xE3o, o seu pet vai te ajudar a economizar nas compras de supermercado - sem falar da praticidade de receber tudo em casa, longe das filas."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 14,
      color: BS.fg2,
      lineHeight: 1.6,
      margin: '0 0 20px'
    }
  }, "10% de tudo que voc\xEA comprar na Pet.Shopper volta para voc\xEA assim:"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      marginBottom: 28
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 16,
      color: BS.fg1,
      minWidth: 32
    }
  }, "5%"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 14,
      color: BS.fg2
    }
  }, "de cashback na loja"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      color: '#225CB3',
      fontWeight: 700,
      fontSize: 14,
      fontFamily: 'Montserrat'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#225CB3",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 9h18l-2-5H5z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"
  })), "Compra Programada")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 16,
      color: BS.fg1,
      minWidth: 32
    }
  }, "5%"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 14,
      color: BS.fg2
    }
  }, "de cashback na loja"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      color: BS.freshGreen,
      fontWeight: 700,
      fontSize: 14,
      fontFamily: 'Montserrat'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: BS.freshGreen,
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 3v4M12 7c-4 0-7 3-7 7v3h14v-3c0-4-3-7-7-7z"
  })), "Programada Fresh"))), /*#__PURE__*/React.createElement("button", {
    style: {
      width: '100%',
      height: 52,
      borderRadius: 999,
      background: BS.pet,
      color: '#fff',
      border: 0,
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 15,
      cursor: 'pointer'
    }
  }, "Come\xE7ar a comprar"))));
}

// ── Pattern 2: Address selection bottom sheet ────────────────
function AddressSheet({
  onClose,
  onConfirm
}) {
  const [selected, setSelected] = React.useState(0);
  const addresses = [{
    name: 'AP 2403',
    street: 'Avenida Guapira, 117, Ap. 2403',
    area: 'Tucuruvi - São Paulo/SP',
    cep: 'CEP 02265000'
  }, {
    name: 'Rua Doutor Constâncio Teani',
    street: 'Rua Doutor Constâncio Teani, 125, Casa 8',
    area: 'Vila Aurora (Zona Norte) - São Paulo/SP',
    cep: 'CEP 02410140'
  }];
  return /*#__PURE__*/React.createElement(Overlay, {
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: BS.bg,
      borderRadius: '24px 24px 0 0'
    }
  }, /*#__PURE__*/React.createElement(DragHandle, null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px 20px 12px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 18,
      color: BS.fg1,
      margin: 0
    }
  }, "Onde quer receber a entrega?"), /*#__PURE__*/React.createElement(CloseBtn, {
    color: BS.red,
    onClose: onClose
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px 16px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      width: '100%',
      height: 48,
      borderRadius: 10,
      background: BS.navy,
      color: '#fff',
      border: 0,
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 14,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 20,
      lineHeight: 1
    }
  }, "\u2295"), " Adicionar outro endere\xE7o"), /*#__PURE__*/React.createElement("div", {
    style: {
      border: `1px solid ${BS.border}`,
      borderRadius: 12,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 16px',
      borderBottom: `1px solid ${BS.border}`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 13,
      color: BS.fg2
    }
  }, "Seus endere\xE7os dispon\xEDveis (9)"), /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: BS.fg3,
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "m18 15-6-6-6 6"
  }))), addresses.map((a, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    onClick: () => setSelected(i),
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '14px 16px',
      borderBottom: i < addresses.length - 1 ? `1px solid ${BS.border}` : 'none',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 22,
      height: 22,
      borderRadius: '50%',
      border: `2px solid ${selected === i ? BS.green : BS.border}`,
      background: selected === i ? BS.green : '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginTop: 2
    }
  }, selected === i && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: '#fff'
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 14,
      color: BS.fg1
    }
  }, a.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 12,
      color: BS.fg3,
      marginTop: 3,
      lineHeight: 1.5
    }
  }, a.street, /*#__PURE__*/React.createElement("br", null), a.area, /*#__PURE__*/React.createElement("br", null), a.cep)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      padding: '8px 16px 32px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      flex: 1,
      height: 48,
      borderRadius: 999,
      background: 'transparent',
      border: 0,
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 15,
      color: BS.red,
      cursor: 'pointer'
    }
  }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
    onClick: onConfirm,
    style: {
      flex: 2,
      height: 48,
      borderRadius: 999,
      background: BS.green,
      color: '#fff',
      border: 0,
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 15,
      cursor: 'pointer'
    }
  }, "Confirmar"))));
}

// ── Pattern 3: Confirmation modal (centered) ─────────────────
function ConfirmationModal({
  onClose
}) {
  return /*#__PURE__*/React.createElement(ModalOverlay, {
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 20px 20px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 18,
      color: BS.fg1,
      margin: '0 0 10px',
      lineHeight: 1.3
    }
  }, "Tudo pronto para come\xE7ar a comprar!"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 14,
      color: BS.fg2,
      margin: '0 0 14px',
      lineHeight: 1.5
    }
  }, "O seu pr\xF3ximo pedido, ser\xE1 entregue nesse endere\xE7o:"), /*#__PURE__*/React.createElement("div", {
    style: {
      border: `1px solid ${BS.border}`,
      borderRadius: 10,
      padding: '14px 16px',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 16,
      color: BS.fg1,
      marginBottom: 6
    }
  }, "AP 2403"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 13,
      color: BS.fg2,
      lineHeight: 1.5
    }
  }, "Avenida Guapira, 117, Ap. 2403, Tucuruvi - S\xE3o Paulo/SP, CEP 02265000")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 13,
      color: BS.fg2,
      margin: '0 0 20px',
      lineHeight: 1.5
    }
  }, "N\xE3o se preocupe! Voc\xEA poder\xE1 alterar o seu endere\xE7o de entrega a qualquer hora em ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: BS.green,
      textDecoration: 'underline',
      cursor: 'pointer'
    }
  }, "Informa\xE7\xF5es da conta"), "."), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: '100%',
      height: 48,
      borderRadius: 10,
      background: BS.green,
      color: '#fff',
      border: 0,
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 16,
      cursor: 'pointer'
    }
  }, "OK")));
}

// ── Pattern 4: Informational bottom sheet with accordion ─────
function FreshInfoSheet({
  onClose
}) {
  const [open, setOpen] = React.useState(false);
  const benefits = [{
    icon: '🔄',
    label: 'Programação semanal ou quinzenal'
  }, {
    icon: '💰',
    label: 'Economia de 5% a 10%'
  }, {
    icon: '📦',
    label: 'Mix completo de produtos frescos'
  }];
  return /*#__PURE__*/React.createElement(Overlay, {
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: BS.bg,
      borderRadius: '24px 24px 0 0',
      maxHeight: '85vh',
      overflowY: 'auto'
    }
  }, /*#__PURE__*/React.createElement(DragHandle, null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      padding: '8px 16px 0'
    }
  }, /*#__PURE__*/React.createElement(CloseBtn, {
    color: BS.fg3,
    onClose: onClose
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 20px 32px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 17,
      color: BS.fg1,
      margin: '0 0 14px',
      lineHeight: 1.4
    }
  }, "Por que esse produto \xE9 mais barato na loja ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: BS.freshGreen
    }
  }, "Programada Fresh"), "?"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 14,
      color: BS.fg2,
      lineHeight: 1.6,
      margin: '0 0 10px'
    }
  }, "Porque esse \xE9 um item fresco que tem validade curta, ideal para ser reabastecido a ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: BS.freshGreen,
      fontWeight: 600
    }
  }, "cada 1 ou 2 semanas")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 14,
      color: BS.fg2,
      lineHeight: 1.6,
      margin: '0 0 20px'
    }
  }, "Quando voc\xEA ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: BS.freshGreen,
      fontWeight: 600
    }
  }, "Programa"), " suas compras, a Shopper consegue ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: BS.freshGreen,
      fontWeight: 600
    }
  }, "organizar melhor"), " e ser mais eficiente - o que se traduz em ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: BS.freshGreen,
      fontWeight: 600
    }
  }, "pre\xE7o menor para voc\xEA"), "."), /*#__PURE__*/React.createElement("div", {
    style: {
      border: `1px solid ${BS.border}`,
      borderRadius: 10,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => setOpen(o => !o),
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '14px 16px',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 14,
      color: BS.fg1
    }
  }, "Como funciona a ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: BS.freshGreen,
      fontWeight: 700
    }
  }, "Programada Fresh")), /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: BS.freshGreen,
    strokeWidth: "2.2",
    strokeLinecap: "round",
    style: {
      transform: open ? 'rotate(180deg)' : 'none',
      transition: 'transform .2s'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "m6 9 6 6 6-6"
  }))), open && /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: `1px solid ${BS.border}`,
      padding: '14px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 10,
      padding: '8px',
      border: `1px solid ${BS.freshGreen}30`,
      borderRadius: 8,
      background: `${BS.freshGreen}08`
    }
  }, benefits.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: `${BS.freshGreen}18`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 18
    }
  }, b.icon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 10,
      color: BS.fg2,
      lineHeight: 1.3
    }
  }, b.label)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 10,
      padding: '12px',
      border: `1px solid ${BS.freshGreen}40`,
      borderRadius: 10,
      background: `${BS.freshGreen}08`,
      marginBottom: 20
    }
  }, benefits.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: `${BS.freshGreen}18`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 18
    }
  }, b.icon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 10,
      color: BS.fg2,
      lineHeight: 1.3
    }
  }, b.label)))), /*#__PURE__*/React.createElement("button", {
    style: {
      width: '100%',
      height: 52,
      borderRadius: 12,
      background: BS.freshGreen,
      color: '#fff',
      border: 0,
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 15,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 12
    }
  }, "Ir para Programada Fresh ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18
    }
  }, "\u2192")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: 'transparent',
      border: 0,
      fontFamily: 'Montserrat',
      fontWeight: 600,
      fontSize: 14,
      color: BS.fg2,
      cursor: 'pointer'
    }
  }, "Cancelar")))));
}
Object.assign(window, {
  BS,
  DragHandle,
  CloseBtn,
  Overlay,
  ModalOverlay,
  PetCashbackSheet,
  AddressSheet,
  ConfirmationModal,
  FreshInfoSheet
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/BottomSheets.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Components.jsx
try { (() => {
// Shopper App UI Kit — Components
// Rebuilt from real iOS screenshots (IMG_0168-0171)

const S = {
  green: '#0DAB77',
  greenDark: '#07A776',
  greenLight: '#E8F5EE',
  greenText: '#00A86B',
  navy: '#002D62',
  navyDark: '#001A42',
  fg1: '#1A1A1A',
  fg2: '#444',
  fg3: '#888',
  muted: '#AAA',
  bg: '#FFFFFF',
  bg2: '#F5F5F5',
  border: '#E8E8E8',
  teal: '#0DAB77',
  amber: '#FFF3E0',
  amberBorder: '#FFB74D'
};

// ── Status Bar ──────────────────────────────────
function StatusBar() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 18px',
      fontFamily: 'system-ui',
      fontWeight: 600,
      fontSize: 15
    }
  }, /*#__PURE__*/React.createElement("span", null, "14:45"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "12",
    viewBox: "0 0 16 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "8",
    width: "2.5",
    height: "4",
    rx: ".5",
    fill: "#000"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "3.5",
    y: "5.5",
    width: "2.5",
    height: "6.5",
    rx: ".5",
    fill: "#000"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "7",
    y: "2.5",
    width: "2.5",
    height: "9.5",
    rx: ".5",
    fill: "#000"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "10.5",
    y: "0",
    width: "2.5",
    height: "12",
    rx: ".5",
    fill: "#ccc"
  })), /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "12",
    viewBox: "0 0 24 18"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 4C8.5 4 5.3 5.4 3 7.7L0 4.7C3.1 1.8 7.3 0 12 0s8.9 1.8 12 4.7l-3 3C18.7 5.4 15.5 4 12 4z",
    fill: "#000"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 10c-2 0-3.8.8-5.1 2.1L4 9.2C5.9 7.3 8.8 6 12 6s6.1 1.3 8 3.2l-2.9 2.9C15.8 10.8 14 10 12 10z",
    fill: "#000"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "16",
    r: "2.5",
    fill: "#000"
  })), /*#__PURE__*/React.createElement("svg", {
    width: "26",
    height: "13",
    viewBox: "0 0 26 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: ".5",
    y: ".5",
    width: "22",
    height: "12",
    rx: "3.5",
    stroke: "#000",
    strokeOpacity: ".35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "19",
    height: "9",
    rx: "2",
    fill: "#000"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M24 4.5v4c.8-.3 1.5-1.2 1.5-2s-.7-1.7-1.5-2z",
    fill: "#000",
    fillOpacity: ".4"
  }))));
}

// ── App Header ──────────────────────────────────
function AppHeader({
  showLogo = true
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 16px 12px',
      background: '#fff'
    }
  }, showLogo && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/logo-programada.png",
    style: {
      height: 40,
      objectFit: 'contain'
    }
  }), /*#__PURE__*/React.createElement("button", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      border: `1.5px solid ${S.navy}`,
      borderRadius: 999,
      padding: '8px 16px',
      background: '#fff',
      fontFamily: 'inherit',
      fontSize: 13,
      fontWeight: 600,
      color: S.navy,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "7",
    r: "4"
  })), "Conta")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      border: `1.5px solid ${S.navy}`,
      borderRadius: 999,
      padding: '9px 16px',
      background: '#fff',
      fontFamily: 'inherit',
      fontSize: 13,
      fontWeight: 600,
      color: S.navy,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 9h18l-2-5H5z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"
  })), "Lojas"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 40,
      borderRadius: 999,
      background: S.bg2,
      display: 'flex',
      alignItems: 'center',
      padding: '0 5px 0 15px',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 13,
      color: S.muted,
      fontWeight: 400
    }
  }, "O que voc\xEA procura?"), /*#__PURE__*/React.createElement("button", {
    style: {
      width: 32,
      height: 32,
      borderRadius: '50%',
      background: S.green,
      border: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "2.5",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 21-4.3-4.3"
  }))))));
}

// ── Category Icon Strip ──────────────────────────
function CategoryStrip({
  active = 0
}) {
  const cats = [{
    label: 'Cashback',
    color: '#4CAF50',
    icon: /*#__PURE__*/React.createElement("svg", {
      width: "28",
      height: "28",
      viewBox: "0 0 32 32"
    }, /*#__PURE__*/React.createElement("ellipse", {
      cx: "16",
      cy: "20",
      rx: "13",
      ry: "10",
      fill: "#4CAF50"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "10",
      cy: "14",
      r: "5",
      fill: "#388E3C"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "22",
      cy: "14",
      r: "5",
      fill: "#388E3C"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "16",
      cy: "12",
      r: "8",
      fill: "#4CAF50"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "13",
      cy: "10",
      r: "1.5",
      fill: "#fff"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M14 18 Q16 20 18 18",
      stroke: "#fff",
      strokeWidth: "1.5",
      fill: "none",
      strokeLinecap: "round"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "14.5",
      y: "7",
      width: "3",
      height: "6",
      rx: "1",
      fill: "#fff"
    }))
  }, {
    label: 'Destaques',
    color: '#FFC107',
    icon: /*#__PURE__*/React.createElement("svg", {
      width: "28",
      height: "28",
      viewBox: "0 0 24 24",
      fill: "#FFC107"
    }, /*#__PURE__*/React.createElement("polygon", {
      points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
    }))
  }, {
    label: 'Select',
    color: '#0DAB77',
    icon: /*#__PURE__*/React.createElement("svg", {
      width: "28",
      height: "28",
      viewBox: "0 0 32 32"
    }, /*#__PURE__*/React.createElement("text", {
      x: "6",
      y: "24",
      fontFamily: "Georgia,serif",
      fontSize: "22",
      fontWeight: "900",
      fill: "#0DAB77"
    }, "S"))
  }, {
    label: 'Suplementos',
    color: '#FF7043',
    icon: /*#__PURE__*/React.createElement("svg", {
      width: "28",
      height: "28",
      viewBox: "0 0 32 32"
    }, /*#__PURE__*/React.createElement("rect", {
      x: "4",
      y: "13",
      width: "24",
      height: "6",
      rx: "3",
      fill: "#FF7043"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "2",
      y: "11",
      width: "6",
      height: "10",
      rx: "2",
      fill: "#FF8A65"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "24",
      y: "11",
      width: "6",
      height: "10",
      rx: "2",
      fill: "#FF8A65"
    }))
  }, {
    label: 'Saudáveis',
    color: '#66BB6A',
    icon: /*#__PURE__*/React.createElement("svg", {
      width: "28",
      height: "28",
      viewBox: "0 0 32 32"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M16 28 C10 22 4 18 6 10 C8 4 14 4 16 10 C18 4 24 4 26 10 C28 18 22 22 16 28Z",
      fill: "#66BB6A"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M16 16 L16 28",
      stroke: "#4CAF50",
      strokeWidth: "1.5"
    }))
  }, {
    label: 'Alimentos',
    color: '#78909C',
    icon: /*#__PURE__*/React.createElement("svg", {
      width: "28",
      height: "28",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "#78909C",
      strokeWidth: "1.8",
      strokeLinecap: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M3 2v7c0 1.66 1.34 3 3 3s3-1.34 3-3V2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M6 2v20M21 15V2a5 5 0 0 0-5 5v6h5M21 22V15"
    }))
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4,
      padding: '10px 12px 14px',
      overflowX: 'auto',
      background: '#fff'
    }
  }, cats.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 5,
      minWidth: 58,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 12,
      background: '#F8F8F8',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, c.icon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 500,
      color: S.fg2,
      textAlign: 'center',
      lineHeight: 1.25
    }
  }, c.label), i === active && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 16,
      height: 2,
      background: S.green,
      borderRadius: 2
    }
  }))));
}

// ── Cashback Banner ──────────────────────────────
function CashbackBanner() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 0 2px',
      background: S.greenLight,
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "32",
    height: "32",
    viewBox: "0 0 32 32",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("ellipse", {
    cx: "16",
    cy: "20",
    rx: "11",
    ry: "9",
    fill: "#0DAB77"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "14",
    r: "4",
    fill: "#077A55"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "21",
    cy: "14",
    r: "4",
    fill: "#077A55"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "16",
    cy: "12",
    r: "7",
    fill: "#0DAB77"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "13.5",
    cy: "10.5",
    r: "1.2",
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.5",
    y: "7",
    width: "3",
    height: "5",
    rx: "1",
    fill: "#fff"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: S.green,
      lineHeight: 1.3
    }
  }, "Compre ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: S.green
    }
  }, "R$1.299"), " e ganhe ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: S.green
    }
  }, "R$100 de volta")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: S.fg2,
      marginTop: 2
    }
  }, "Faltam ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: S.green,
      fontWeight: 600
    }
  }, "R$516,10"), " para voc\xEA ganhar ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: S.navy,
      fontWeight: 700
    }
  }, "R$ 100"))), /*#__PURE__*/React.createElement("button", {
    style: {
      background: S.green,
      color: '#fff',
      border: 0,
      borderRadius: 999,
      padding: '7px 12px',
      fontFamily: 'inherit',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    }
  }, "Saiba Mais"));
}

// ── Notification Bar ─────────────────────────────
function NotificationBar({
  msg,
  onClose
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#FFF8E1',
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      borderTop: `1px solid #FFE082`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 6,
      background: '#FFB300',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 12,
      color: S.fg1,
      lineHeight: 1.45
    }
  }, msg), /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'transparent',
      border: 0,
      color: S.fg3,
      cursor: 'pointer',
      padding: 0,
      fontSize: 18,
      lineHeight: 1
    }
  }, "\xD7"));
}

// ── Brand Circles Row ────────────────────────────
function BrandCircles() {
  const brands = [{
    label: "Tony's",
    bg: '#CC1C2B',
    img: null
  }, {
    label: 'Novidades da Semana',
    bg: S.navy,
    img: null
  }, {
    label: 'Shopper Indica',
    bg: S.navy,
    img: null
  }, {
    label: 'Feastables',
    bg: '#00B4D8',
    img: null
  }, {
    label: 'Café',
    bg: '#5D4037',
    img: null
  }];
  const icons = [/*#__PURE__*/React.createElement("svg", {
    width: "38",
    height: "38",
    viewBox: "0 0 40 40"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "4",
    y: "10",
    width: "32",
    height: "20",
    rx: "4",
    fill: "#fff",
    opacity: ".15"
  }), /*#__PURE__*/React.createElement("text", {
    x: "20",
    y: "26",
    textAnchor: "middle",
    fontSize: "11",
    fontWeight: "900",
    fill: "#fff",
    fontFamily: "Arial"
  }, "Tony's")), /*#__PURE__*/React.createElement("svg", {
    width: "38",
    height: "38",
    viewBox: "0 0 40 40"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 8 L28 16 L20 32 L12 16 Z",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "20",
    cy: "20",
    r: "5",
    fill: "#fff",
    fillOpacity: ".3"
  })), /*#__PURE__*/React.createElement("svg", {
    width: "38",
    height: "38",
    viewBox: "0 0 40 40"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "8",
    y: "8",
    width: "24",
    height: "24",
    rx: "4",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 20 L18 24 L26 16",
    stroke: "#fff",
    strokeWidth: "2.5",
    fill: "none",
    strokeLinecap: "round"
  })), /*#__PURE__*/React.createElement("svg", {
    width: "38",
    height: "38",
    viewBox: "0 0 40 40"
  }, /*#__PURE__*/React.createElement("text", {
    x: "20",
    y: "26",
    textAnchor: "middle",
    fontSize: "10",
    fontWeight: "900",
    fill: "#fff",
    fontFamily: "Arial"
  }, "Feast")), /*#__PURE__*/React.createElement("svg", {
    width: "38",
    height: "38",
    viewBox: "0 0 40 40"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M14 24 Q14 14 20 12 Q26 14 26 24",
    fill: "#fff",
    fillOpacity: ".2",
    stroke: "#fff",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "12",
    y: "24",
    width: "16",
    height: "4",
    rx: "2",
    fill: "#fff",
    opacity: ".5"
  }))];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      padding: '14px 16px',
      overflowX: 'auto',
      background: '#fff'
    }
  }, brands.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 7,
      minWidth: 64,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: '50%',
      background: b.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,.12)'
    }
  }, icons[i]), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 500,
      color: S.fg1,
      textAlign: 'center',
      lineHeight: 1.3,
      maxWidth: 72
    }
  }, b.label))));
}

// ── Section Header ────────────────────────────────
function SectionHeader({
  title
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '14px 16px 10px',
      background: '#fff'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: S.fg1
    }
  }, title), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: S.green,
      cursor: 'pointer'
    }
  }, "+ Ver todos"));
}

// ── Product Card ──────────────────────────────────
function ProductCard({
  name,
  price,
  oldPrice,
  badge,
  img,
  added = false
}) {
  const [qty, setQty] = React.useState(added ? 1 : 0);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      borderRadius: 8,
      overflow: 'hidden',
      border: `1px solid ${S.border}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      aspectRatio: '1',
      background: '#F8F8F8'
    }
  }, img ? /*#__PURE__*/React.createElement("img", {
    src: img,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: S.muted,
      fontSize: 10,
      fontWeight: 600
    }
  }, "FOTO"), badge && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 8,
      right: 8,
      background: 'rgba(255,255,255,.92)',
      border: `1px solid ${S.border}`,
      borderRadius: 4,
      padding: '2px 6px',
      fontSize: 10,
      fontWeight: 700,
      color: S.fg2
    }
  }, badge), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 6,
      right: 6
    }
  }, qty === 0 ? /*#__PURE__*/React.createElement("button", {
    onClick: () => setQty(1),
    style: {
      width: 30,
      height: 30,
      borderRadius: 8,
      background: '#fff',
      border: `1.5px solid ${S.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      boxShadow: '0 1px 4px rgba(0,0,0,.1)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: S.green,
    strokeWidth: "2.5",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14M5 12h14"
  }))) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: '#fff',
      border: `1.5px solid ${S.green}`,
      borderRadius: 8,
      padding: '3px 6px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setQty(q => Math.max(0, q - 1)),
    style: {
      border: 0,
      background: 'transparent',
      color: S.green,
      fontWeight: 700,
      fontSize: 16,
      cursor: 'pointer',
      lineHeight: 1,
      padding: '0 2px'
    }
  }, "\u2212"), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 14,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: 700,
      color: S.fg1
    }
  }, qty), /*#__PURE__*/React.createElement("button", {
    onClick: () => setQty(q => q + 1),
    style: {
      border: 0,
      background: 'transparent',
      color: S.green,
      fontWeight: 700,
      fontSize: 16,
      cursor: 'pointer',
      lineHeight: 1,
      padding: '0 2px'
    }
  }, "+")))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 8px 10px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: S.fg2,
      lineHeight: 1.35,
      minHeight: 30
    }
  }, name), oldPrice && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: S.muted,
      textDecoration: 'line-through',
      marginTop: 4
    }
  }, "R$ ", oldPrice), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: S.fg1,
      marginTop: 2
    }
  }, "R$ ", price)));
}

// ── "Congelado" Badge ────────────────────────────
function CongeladoBadge() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: 'rgba(0,150,136,.12)',
      color: '#00897B',
      borderRadius: 999,
      padding: '3px 8px',
      fontSize: 10,
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93 4.93 19.07"
  })), "Congelado");
}

// ── Cart Footer ───────────────────────────────────
function CartFooter({
  count = 34,
  total = '782'
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      display: 'flex',
      borderTop: `1px solid ${S.border}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '0 16px',
      background: '#fff'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: S.navy,
    strokeWidth: "1.8",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 6h18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 10a4 4 0 0 1-8 0"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: S.navy
    }
  }, count, " - R$", total)), /*#__PURE__*/React.createElement("button", {
    style: {
      flex: 1,
      background: S.green,
      border: 0,
      color: '#fff',
      fontFamily: 'inherit',
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: '.06em',
      cursor: 'pointer'
    }
  }, "FINALIZAR ALTERA\xC7\xD5ES"));
}

// ── Tab Bar ───────────────────────────────────────
function TabBar({
  cur = 'Compras'
}) {
  const tabs = [{
    n: 'Compras',
    icon: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M3 9h18l-2-5H5z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"
    }))
  }, {
    n: 'Pesquisa',
    icon: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "11",
      cy: "11",
      r: "7"
    }), /*#__PURE__*/React.createElement("path", {
      d: "m21 21-4.3-4.3"
    }))
  }, {
    n: 'Carrinho',
    icon: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 6h18"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M16 10a4 4 0 0 1-8 0"
    }))
  }, {
    n: 'Entregas',
    icon: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      width: "16",
      height: "12",
      x: "1",
      y: "7",
      rx: "1"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M16 7l3 3v3h-3"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "5.5",
      cy: "19.5",
      r: "1.5"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "16.5",
      cy: "19.5",
      r: "1.5"
    }))
  }, {
    n: 'Chat',
    icon: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
    }))
  }];
  const active = S.green;
  const inactive = '#999';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 70,
      background: '#fff',
      borderTop: `1px solid ${S.border}`,
      display: 'flex',
      paddingBottom: 8
    }
  }, tabs.map(t => {
    const on = cur === t.n;
    return /*#__PURE__*/React.createElement("div", {
      key: t.n,
      style: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        color: on ? active : inactive,
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "22",
      height: "22",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: on ? '2.2' : '1.7',
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, t.icon), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'inherit',
        fontSize: 10,
        fontWeight: on ? 700 : 500
      }
    }, t.n));
  }));
}
Object.assign(window, {
  S,
  StatusBar,
  AppHeader,
  CategoryStrip,
  CashbackBanner,
  NotificationBar,
  BrandCircles,
  SectionHeader,
  ProductCard,
  CongeladoBadge,
  CartFooter,
  TabBar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Components.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/ios-frame.jsx
try { (() => {
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports: IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ios-frame.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/Components.jsx
try { (() => {
// Web UI Kit — shopper.com.br marketing landing page
// Rebuilt from real landing page screenshot

const WC = {
  navy: '#002D62',
  navyDeep: '#151A33',
  green: '#0DAB77',
  greenDark: '#07A776',
  greenLight: '#E8F5EE',
  fg1: '#1A1A1A',
  fg2: '#444',
  fg3: '#888',
  bg: '#fff',
  bg2: '#F7F7F7',
  border: '#E8E8E8',
  programada: '#225CB3',
  fresh: '#85CE2B',
  pet: '#F2749E'
};

// ── Nav ─────────────────────────────────────────────────────
function WebNav() {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      background: WC.navy,
      padding: '0 40px',
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/logo-dark.svg",
    style: {
      height: 28,
      objectFit: 'contain'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 600,
      fontSize: 13,
      color: 'rgba(255,255,255,.8)',
      textDecoration: 'none'
    }
  }, "J\xE1 sou Shopper"), /*#__PURE__*/React.createElement("button", {
    style: {
      height: 36,
      padding: '0 20px',
      borderRadius: 999,
      background: WC.green,
      color: '#fff',
      border: 0,
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 13,
      cursor: 'pointer'
    }
  }, "Come\xE7ar a comprar")));
}

// ── Hero ─────────────────────────────────────────────────────
function WebHero() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      minHeight: 480,
      display: 'flex',
      alignItems: 'center',
      overflow: 'hidden',
      background: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      opacity: .04,
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 60 Q30 0 60 60' fill='none' stroke='%23002D62' stroke-width='1'/%3E%3C/svg%3E")`,
      backgroundSize: '60px 60px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: '60px 60px 60px 80px',
      position: 'relative',
      zIndex: 1,
      maxWidth: 560
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 900,
      fontSize: 52,
      color: WC.navy,
      lineHeight: 1.08,
      letterSpacing: '-.01em',
      marginBottom: 20
    }
  }, "Seu supermercado online.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: WC.fg2,
      fontWeight: 400,
      fontSize: 44
    }
  }, "Compre sem sair de casa.")), /*#__PURE__*/React.createElement("button", {
    style: {
      height: 48,
      padding: '0 32px',
      borderRadius: 999,
      background: WC.green,
      color: '#fff',
      border: 0,
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 15,
      cursor: 'pointer',
      marginTop: 8
    }
  }, "Saiba mais")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 480,
      position: 'relative',
      background: '#1A1A1A',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/imagery/hero-products.png",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      opacity: .9
    }
  })));
}

// ── Sub-brand cards ──────────────────────────────────────────
function SubBrandCards() {
  const brands = [{
    logo: 'logo-programada.png',
    title: 'Compra Programada',
    desc: 'Faça sua compra de mercado mensal e economize de 5 a 10% com preços mais baixos. Mais de 10.000 produtos.',
    cta: 'Saiba mais',
    accent: WC.programada
  }, {
    logo: 'logo-fresh.png',
    title: 'Programada Fresh',
    desc: 'Hortifrúti, carnes e laticínios selecionados entregues toda semana. Qualidade e frescor na sua porta.',
    cta: 'Saiba mais',
    accent: WC.fresh
  }, {
    logo: 'logo-unica.png',
    title: 'Compra Única',
    desc: 'Faça uma compra avulsa sem precisar de programação. Praticidade para quando você precisar.',
    cta: 'Saiba mais',
    accent: WC.green
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '64px 80px',
      background: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginBottom: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 600,
      fontSize: 14,
      color: WC.fg3,
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      marginBottom: 10
    }
  }, "Escolha o modelo que mais combina com voc\xEA")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 24,
      maxWidth: 1100,
      margin: '0 auto'
    }
  }, brands.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: '#fff',
      border: `1px solid ${WC.border}`,
      borderRadius: 12,
      padding: '32px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      boxShadow: '0 2px 12px rgba(0,45,98,.06)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: `../../assets/logos/${b.logo}`,
    style: {
      height: 36,
      objectFit: 'contain',
      objectPosition: 'left'
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 14,
      color: WC.fg2,
      lineHeight: 1.6,
      margin: 0,
      flex: 1
    }
  }, b.desc), /*#__PURE__*/React.createElement("button", {
    style: {
      height: 40,
      borderRadius: 999,
      background: '#fff',
      border: `1.5px solid ${b.accent}`,
      color: b.accent,
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 13,
      cursor: 'pointer'
    }
  }, b.cta)))));
}

// ── Green feature band ───────────────────────────────────────
function GreenBand() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: WC.green,
      padding: '60px 80px',
      display: 'flex',
      alignItems: 'center',
      gap: 60,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Raleway',
      fontWeight: 800,
      fontSize: 38,
      lineHeight: 1.15,
      marginBottom: 16
    }
  }, "Tudo pronto", /*#__PURE__*/React.createElement("br", null), "em poucos", /*#__PURE__*/React.createElement("br", null), "cliques."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 15,
      lineHeight: 1.6,
      opacity: .9,
      maxWidth: 380,
      margin: 0
    }
  }, "Adicione os produtos, escolha a data de entrega e relaxe. A Shopper cuida do resto.")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
      minHeight: 280
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 200,
      height: 280,
      borderRadius: 24,
      background: 'rgba(255,255,255,.15)',
      border: '2px solid rgba(255,255,255,.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 12,
      color: 'rgba(255,255,255,.7)',
      textAlign: 'center'
    }
  }, "App mockup")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: 60,
      width: 280,
      height: 200,
      borderRadius: 12,
      background: 'rgba(255,255,255,.12)',
      border: '2px solid rgba(255,255,255,.25)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 12,
      color: 'rgba(255,255,255,.6)',
      textAlign: 'center'
    }
  }, "Desktop mockup"))));
}

// ── Lista section ────────────────────────────────────────────
function ListaSection() {
  const items = ['Produtos do dia a dia', 'Hortifrúti selecionado', 'Carnes e laticínios', 'Limpeza e higiene', 'Pet e bebês'];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      padding: '80px',
      gap: 60,
      background: '#fff',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Raleway',
      fontWeight: 800,
      fontSize: 36,
      color: WC.navy,
      lineHeight: 1.2,
      marginBottom: 8
    }
  }, "Sua lista"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Raleway',
      fontWeight: 800,
      fontSize: 36,
      color: WC.green,
      lineHeight: 1.2,
      marginBottom: 24
    }
  }, "sempre completa."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      marginBottom: 28
    }
  }, items.map((item, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 18,
      height: 18,
      borderRadius: '50%',
      background: WC.green,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "8",
    viewBox: "0 0 10 8"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 4l3 3 5-6",
    stroke: "#fff",
    strokeWidth: "1.8",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 14,
      color: WC.fg2
    }
  }, item)))), /*#__PURE__*/React.createElement("button", {
    style: {
      height: 44,
      padding: '0 28px',
      borderRadius: 999,
      background: WC.green,
      color: '#fff',
      border: 0,
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 14,
      cursor: 'pointer'
    }
  }, "Come\xE7ar agora")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 360,
      borderRadius: 16,
      background: `url(../../assets/imagery/shopping-list.png) center/cover`,
      boxShadow: '0 12px 40px rgba(0,45,98,.12)'
    }
  }));
}

// ── Dark navy watermark band ─────────────────────────────────
function NavyBand() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: WC.navyDeep,
      padding: '80px',
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: -40,
      top: '50%',
      transform: 'translateY(-50%)',
      fontFamily: 'Montserrat',
      fontWeight: 900,
      fontSize: 400,
      color: 'rgba(255,255,255,.04)',
      lineHeight: 1,
      userSelect: 'none',
      pointerEvents: 'none'
    }
  }, "S"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      maxWidth: 600
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Raleway',
      fontWeight: 800,
      fontSize: 42,
      color: '#fff',
      lineHeight: 1.15,
      marginBottom: 20
    }
  }, "Seu jeito inteligente do", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: WC.green
    }
  }, "fazer o mercado.")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 15,
      color: 'rgba(255,255,255,.75)',
      lineHeight: 1.7,
      maxWidth: 500,
      margin: 0
    }
  }, "A Shopper cuida das suas compras do m\xEAs para que voc\xEA nunca fique sem o essencial, sempre com os melhores pre\xE7os.")));
}

// ── Category photo grid ──────────────────────────────────────
function CategoryGrid() {
  const cats = [{
    label: 'Bebidas',
    bg: '#C4DEF5'
  }, {
    label: 'Orgânicos',
    bg: '#D4ECC4'
  }, {
    label: 'Laticínios',
    bg: '#F5EED4'
  }, {
    label: 'Pet',
    bg: '#F5D4E4'
  }, {
    label: 'Limpeza',
    bg: '#D4EEF5'
  }, {
    label: 'Padaria',
    bg: '#F5DEC4'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '64px 80px',
      background: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 22,
      color: WC.navy,
      textAlign: 'center',
      marginBottom: 36
    }
  }, "Tudo que voc\xEA precisa a Shopper tem"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gridTemplateRows: '240px 240px',
      gap: 12,
      maxWidth: 1100,
      margin: '0 auto'
    }
  }, cats.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      borderRadius: 12,
      background: c.bg,
      position: 'relative',
      overflow: 'hidden',
      cursor: 'pointer'
    }
  }, i === 0 && /*#__PURE__*/React.createElement("img", {
    src: "../../assets/imagery/hero-products.png",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      position: 'absolute',
      inset: 0,
      opacity: .7
    }
  }), i === 2 && /*#__PURE__*/React.createElement("img", {
    src: "../../assets/imagery/cooking.png",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      position: 'absolute',
      inset: 0,
      opacity: .7
    }
  }), i === 3 && /*#__PURE__*/React.createElement("img", {
    src: "../../assets/imagery/pet-banner.png",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      position: 'absolute',
      inset: 0,
      opacity: .7
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 14,
      left: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      background: WC.green,
      color: '#fff',
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 12,
      padding: '5px 14px',
      borderRadius: 999
    }
  }, c.label))))));
}

// ── Testimonials ─────────────────────────────────────────────
function Testimonials() {
  const reviews = [{
    name: 'Thayanna M.',
    text: 'Minha experiência com a Shopper foi perfeita. Minha primeira compra chegou hoje e não tenho o que reclamar.'
  }, {
    name: 'Ana Paula R.',
    text: 'Eu amo a Shopper, as compras chegam embaladas em caixas, separadas/categorizadas e sinalizadas.'
  }, {
    name: 'Ricardo F.',
    text: 'Serviço excelente. As entregas sempre no prazo e os produtos de ótima qualidade.'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: WC.navyDeep,
      padding: '72px 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 13,
      color: WC.green,
      textTransform: 'uppercase',
      letterSpacing: '.1em',
      marginBottom: 8
    }
  }, "Saiba de quem j\xE1 \xE9 Shopper"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 32,
      marginTop: 32
    }
  }, reviews.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 14,
      color: 'rgba(255,255,255,.8)',
      lineHeight: 1.7,
      marginBottom: 12
    }
  }, "\"", r.text, "\""), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 13,
      color: WC.green
    }
  }, "\u2014 ", r.name)))));
}

// ── FAQ ──────────────────────────────────────────────────────
function FAQ() {
  const [open, setOpen] = React.useState(0);
  const items = [{
    q: 'Como funciona a Shopper?',
    a: 'A Shopper é um supermercado online que entrega seus produtos em casa. Basta criar uma conta, montar sua lista e escolher a data de entrega.'
  }, {
    q: 'Que tipos de produtos a Shopper entrega?',
    a: 'Entregamos mais de 10.000 produtos: alimentos, bebidas, higiene, limpeza, pet, hortifrúti, carnes e laticínios.'
  }, {
    q: 'A Shopper cobra frete ou taxa de entrega?',
    a: 'Sim, o frete varia de acordo com a sua região e o valor do pedido. Compras acima do valor mínimo têm frete reduzido.'
  }, {
    q: 'Posso alterar meu pedido depois de feito?',
    a: 'Sim, você pode alterar seu pedido até o prazo de corte definido para a sua entrega.'
  }, {
    q: 'Quais são as formas de pagamento?',
    a: 'Aceitamos cartões de crédito e débito, Pix e vouchers de alimentação.'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '64px 80px',
      background: '#fff',
      maxWidth: 900,
      margin: '0 auto',
      boxSizing: 'border-box',
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 22,
      color: WC.navy,
      marginBottom: 32,
      textAlign: 'center'
    }
  }, "D\xFAvidas frequentes"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 0
    }
  }, items.map((item, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      borderBottom: `1px solid ${WC.border}`
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(open === i ? -1 : i),
    style: {
      width: '100%',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '18px 0',
      background: 'transparent',
      border: 0,
      cursor: 'pointer',
      fontFamily: 'Montserrat',
      fontWeight: 600,
      fontSize: 15,
      color: WC.fg1,
      textAlign: 'left'
    }
  }, item.q, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: WC.green,
    strokeWidth: "2.2",
    strokeLinecap: "round",
    style: {
      flexShrink: 0,
      transform: open === i ? 'rotate(180deg)' : 'none',
      transition: 'transform .2s'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "m6 9 6 6 6-6"
  }))), open === i && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 14,
      color: WC.fg2,
      lineHeight: 1.7,
      paddingBottom: 18
    }
  }, item.a)))));
}

// ── Footer ───────────────────────────────────────────────────
function WebFooter() {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: WC.navy,
      padding: '48px 80px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
      gap: 40,
      marginBottom: 40
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/logo-dark.svg",
    style: {
      height: 28,
      marginBottom: 16
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 13,
      color: 'rgba(255,255,255,.6)',
      lineHeight: 1.7,
      maxWidth: 280,
      margin: 0
    }
  }, "Um mundo onde os produtos essenciais cheguem na sua casa com a mesma facilidade que a \xE1gua chega na torneira.")), [['Shopper', ['Sobre nós', 'Carreiras', 'Imprensa', 'Blog']], ['Ajuda', ['Central de ajuda', 'Devoluções', 'Contato', 'FAQ']], ['Legal', ['Termos de uso', 'Privacidade', 'Cookies']]].map(([h, links]) => /*#__PURE__*/React.createElement("div", {
    key: h
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 12,
      color: 'rgba(255,255,255,.5)',
      letterSpacing: '.1em',
      textTransform: 'uppercase',
      marginBottom: 14
    }
  }, h), links.map(l => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      fontFamily: 'Montserrat',
      fontSize: 13,
      color: 'rgba(255,255,255,.7)',
      marginBottom: 8,
      cursor: 'pointer'
    }
  }, l))))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid rgba(255,255,255,.12)',
      paddingTop: 20,
      fontFamily: 'Montserrat',
      fontSize: 12,
      color: 'rgba(255,255,255,.4)'
    }
  }, "\xA9 2026 Shopper.com.br \xB7 Todos os direitos reservados"));
}
Object.assign(window, {
  WC,
  WebNav,
  WebHero,
  SubBrandCards,
  GreenBand,
  ListaSection,
  NavyBand,
  CategoryGrid,
  Testimonials,
  FAQ,
  WebFooter
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/Components.jsx", error: String((e && e.message) || e) }); }

})();
