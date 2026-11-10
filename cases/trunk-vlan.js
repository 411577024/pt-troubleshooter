/* 案例：同一個 VLAN 的兩台 PC 不通（交換器 access VLAN 與 trunk 允許清單）
 * 介面名稱（Fa0/1、Fa0/24）和位址只是範例，請依你自己的 Packet Tracer 檔案調整；
 * 這個案例的結果都要由同學實測後回報。
 */
window.CASES = window.CASES || [];
window.CASES.push({
  id: 'trunk-vlan',
  title: '同一個 VLAN 的兩台 PC 不通',
  symptom: 'PC0 接在 SW0，PC1 接在 SW1，兩台都應該在 VLAN 10（192.168.10.0/24），中間用一條 trunk 相連。PC0 ping PC1 失敗。',

  topology: {
    nodes: [
      { id: 'pc0', type: 'pc',     label: 'PC0', sub: '192.168.10.10' },
      { id: 'sw0', type: 'switch', label: 'SW0', sub: 'VLAN 10 access' },
      { id: 'sw1', type: 'switch', label: 'SW1', sub: 'VLAN 10 access' },
      { id: 'pc1', type: 'pc',     label: 'PC1', sub: '192.168.10.20' }
    ],
    links: [
      { from: 'pc0', to: 'sw0', label: 'Fa0/1' },
      { from: 'sw0', to: 'sw1', label: 'trunk' },
      { from: 'sw1', to: 'pc1', label: 'Fa0/1' }
    ]
  },

  segments: [
    { id: 'e2e',    label: 'PC0 → PC1 端對端' },
    { id: 'ip',     label: '兩台 PC 的 IP 與遮罩' },
    { id: 'access', label: '兩台交換器的 access VLAN' },
    { id: 'trunk',  label: 'trunk 的允許清單' }
  ],

  start: 'start',

  steps: {
    start: {
      title: '先測 PC0 到 PC1',
      segment: 'e2e',
      focus: ['pc0', 'pc1'],
      where: 'PC0 → Desktop → Command Prompt',
      commands: ['ping 192.168.10.20'],
      observe: ['連續執行幾次。第一次常因 ARP 逾時，之後穩定出現 Reply 才算通。'],
      options: [
        { label: '有通（穩定收到回覆）', next: 'end-ok', marks: { e2e: 'pass' },
          reason: 'PC0 已穩定收到 PC1 的回覆，不需要排查。' },
        { label: '不通（持續失敗）', next: 'ip', marks: { e2e: 'fail' },
          reason: '同一個 VLAN 內不經過路由器，所以先排除最簡單的原因：兩台 PC 的位址是否真的在同一網段。' }
      ]
    },

    ip: {
      title: '核對兩台 PC 的 IP 與遮罩',
      segment: 'ip',
      focus: ['pc0', 'pc1'],
      where: 'PC0 和 PC1 都要看：Desktop → Command Prompt',
      commands: ['ipconfig'],
      observe: [
        '兩台的前三段要相同（例如 192.168.10.x），遮罩要一致，例如 255.255.255.0。',
        '兩台的 IP 不能重複。'
      ],
      options: [
        { label: '兩台設定都正確', next: 'access', marks: { ip: 'pass' },
          reason: '位址沒問題，接著看交換器：PC 所在的埠是不是被放進正確的 VLAN。' },
        { label: '有錯，我已改好', next: 'retest', marks: { ip: 'pass' },
          reason: '更改設定後，要回到 PC0 重測原本的目標 PC1。' }
      ]
    },

    access: {
      title: '檢查兩台交換器的 access VLAN',
      segment: 'access',
      focus: ['sw0', 'sw1'],
      where: 'SW0 和 SW1 的 CLI 都要看（先輸入 enable）',
      commands: ['show vlan brief'],
      observe: [
        '接 PC 的埠（例如 Fa0/1）要出現在 VLAN 10 底下，而且 VLAN 10 要存在、狀態為 active。',
        '如果接 PC 的埠還在預設的 VLAN 1，PC0 和 PC1 就不在同一個 VLAN。'
      ],
      options: [
        { label: '兩台的 PC 埠都在 VLAN 10', next: 'trunk', marks: { access: 'pass' },
          reason: '兩端的 access 設定正確，接著看兩台交換器中間的 trunk 有沒有放行 VLAN 10。' },
        { label: '有一台不對', next: 'fix-access', marks: { access: 'fail' },
          reason: 'PC 的埠不在 VLAN 10，它的廣播就到不了另一台 PC，需要修正該埠的 VLAN。' }
      ]
    },

    'fix-access': {
      title: '修正 access 埠的 VLAN',
      segment: 'access',
      focus: ['sw0', 'sw1'],
      where: '有問題的那台交換器 → CLI',
      commands: [
        'configure terminal',
        'vlan 10',
        'exit',
        'interface fastEthernet 0/1',
        'switchport mode access',
        'switchport access vlan 10',
        'end',
        'show vlan brief'
      ],
      observe: ['再看一次 show vlan brief，確認 PC 的埠出現在 VLAN 10。埠的名稱請換成你實際接 PC 的埠。'],
      afterNote: '更改設定後，回到 PC0 重測原本的 PC1。',
      options: [
        { label: '埠已在 VLAN 10，回 PC0 重測', next: 'retest', marks: { access: 'pass' },
          reason: '更改設定後，要回到 PC0 重測原本的目標 PC1。' }
      ]
    },

    trunk: {
      title: '檢查 trunk 的允許清單',
      segment: 'trunk',
      focus: ['sw0', 'sw1'],
      where: 'SW0 和 SW1 的 CLI 都要看',
      commands: ['show interfaces trunk'],
      observe: [
        '互連埠要出現在清單裡，Mode 為 on，Status 為 trunking。',
        '"Vlans allowed on trunk" 與 "Vlans in spanning tree forwarding state and not pruned" 都要包含 10。',
        '兩端的 Native vlan 也要一致，不一致時 Packet Tracer 會顯示警告訊息。'
      ],
      options: [
        { label: '兩台都有 trunking，且清單包含 VLAN 10', next: 'end-pending', marks: { trunk: 'pass' },
          reason: '前面各段都沒有找到錯誤，這個案例的步驟已用完，需要進一步檢查（見下一頁）。' },
        { label: '沒有 trunking，或清單沒有 VLAN 10', next: 'fix-trunk', marks: { trunk: 'fail' },
          reason: 'VLAN 10 的流量過不了交換器之間的連線，兩邊的 PC 就互相看不到。' }
      ]
    },

    'fix-trunk': {
      title: '修正 trunk 與允許清單',
      segment: 'trunk',
      focus: ['sw0', 'sw1'],
      where: '清單缺少 VLAN 10 的那台交換器 → CLI',
      commands: [
        'configure terminal',
        'interface fastEthernet 0/24',
        'switchport mode trunk',
        'switchport trunk allowed vlan add 10',
        'end',
        'show interfaces trunk'
      ],
      observe: [
        '用 add 是在原有清單上加入 VLAN 10；如果直接寫 allowed vlan 10，會把原本放行的其他 VLAN 一起取代掉。',
        '兩端的 trunk 埠都要確認。埠的名稱請換成你實際連到另一台交換器的埠。'
      ],
      afterNote: '更改設定後，回到 PC0 重測原本的 PC1。',
      options: [
        { label: '清單已包含 VLAN 10，回 PC0 重測', next: 'retest', marks: { trunk: 'pass' },
          reason: '更改設定後，要回到 PC0 重測原本的目標 PC1。' }
      ]
    },

    retest: {
      title: '回 PC0 重測 PC1',
      segment: 'e2e',
      focus: ['pc0', 'pc1'],
      where: 'PC0 → Desktop → Command Prompt',
      commands: ['ping 192.168.10.20'],
      observe: ['連續執行幾次，穩定收到回覆才算通。'],
      options: [
        { label: '有通（穩定收到回覆）', next: 'end-ok', marks: { e2e: 'pass' },
          reason: 'PC0 已收到 PC1 的回覆。' },
        { label: '還是不通', next: 'resume', marks: { e2e: 'fail' },
          reason: '可能還有別段沒修好。已測過的結果會保留，你可以接著查其他段。' }
      ]
    },

    resume: {
      title: '仍不通：選下一段繼續查',
      focus: [],
      where: '看一下頁面下方的「各段檢查狀態」',
      commands: [],
      observe: ['標示「待驗證」的段落是還沒測過的，優先從那裡查；標示「有問題」的段落，確認是否真的修好了。'],
      options: [
        { label: '查 PC 的 IP 與遮罩', next: 'ip', marks: {}, reason: '重新核對兩台 PC 的位址。' },
        { label: '查 access VLAN', next: 'access', marks: {}, reason: '重新核對兩台交換器的 PC 埠。' },
        { label: '查 trunk 允許清單', next: 'trunk', marks: {}, reason: '重新核對交換器之間的 trunk。' },
        { label: '先記為「待驗證」', next: 'end-pending', marks: {}, reason: '先保留目前的測試紀錄。' }
      ]
    },

    'end-ok': {
      type: 'end',
      status: 'connected',
      title: '已連通',
      focus: ['pc0', 'sw0', 'sw1', 'pc1'],
      summary: 'PC0 已收到 PC1 的回覆。可以看下方「本次測試紀錄」，回顧這次修了哪些地方。',
      points: [
        '同 VLAN 要互通，需要：PC 位址在同一網段、PC 埠在同一個 VLAN、trunk 放行該 VLAN。',
        '建議把設定存起來（write memory）。'
      ]
    },

    'end-pending': {
      type: 'end',
      status: 'pending',
      title: '待驗證',
      focus: [],
      summary: '目前還沒有確認連通。已測過的結果都保留在下方，沒測過的段落標為「待驗證」。',
      points: [
        '可以再確認：兩端 trunk 埠是否 up / up（show ip interface brief）、兩端 Native VLAN 是否一致。',
        '接 PC 的埠是否被 shutdown 或因 port-security 被關閉（show interfaces status）。',
        '線材與介面是否接對。'
      ],
      options: [
        { label: '繼續排查', next: 'resume', marks: {}, reason: '回到「選下一段繼續查」。' }
      ]
    }
  }
});
