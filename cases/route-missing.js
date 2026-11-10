/* 案例：兩台 PC 在不同網段，ping 不通
 * 格式：故障現象(symptom)、拓樸(topology)、測試步驟與結果分支(steps)、最後驗證(retest / end-ok)
 * 每個 option 的 marks 會更新「各段檢查狀態」：pass = 通過、fail = 有問題；沒測過的段落顯示「待驗證」。
 */
window.CASES = window.CASES || [];
window.CASES.push({
  id: 'route-missing',
  title: '不同網段的兩台 PC ping 不通',
  symptom: 'PC0 在 192.168.40.0/24，PC1 在 192.168.30.0/24，中間隔著 R0 與 R1。PC0 ping PC1（192.168.30.2）一直失敗。',

  topology: {
    nodes: [
      { id: 'pc0', type: 'pc',     label: 'PC0', sub: '192.168.40.x' },
      { id: 'r0',  type: 'router', label: 'R0',  sub: 'LAN 192.168.40.2' },
      { id: 'r1',  type: 'router', label: 'R1',  sub: '互連 10.0.0.2' },
      { id: 'pc1', type: 'pc',     label: 'PC1', sub: '192.168.30.2' }
    ],
    links: [
      { from: 'pc0', to: 'r0', label: '192.168.40.0/24' },
      { from: 'r0',  to: 'r1', label: '10.0.0.0 互連' },
      { from: 'r1',  to: 'pc1', label: '192.168.30.0/24' }
    ]
  },

  segments: [
    { id: 'e2e',    label: 'PC0 → PC1 端對端' },
    { id: 'gw',     label: 'PC0 → 本地閘道 192.168.40.2' },
    { id: 'pcgw',   label: 'PC0 的預設閘道設定' },
    { id: 'link',   label: 'R0 → R1（10.0.0.2）互連' },
    { id: 'r0route', label: 'R0 的去程路由（到 192.168.30.0/24）' },
    { id: 'r1route', label: 'R1 的回程路由（到 192.168.40.0/24）' },
    { id: 'pc1',    label: 'PC1 的設定' }
  ],

  start: 'start',

  steps: {
    /* ---------- 第一步：端對端 ---------- */
    start: {
      title: '先測 PC0 到 PC1',
      focus: ['pc0', 'pc1'],
      where: 'PC0 → Desktop → Command Prompt',
      commands: ['ping 192.168.30.2'],
      observe: [
        '連續執行幾次。第一次常因為 ARP 還在學習而逾時，之後若穩定出現 Reply from 192.168.30.2 就算通。',
        '如果每一次都是 Request timed out 或 Destination host unreachable，就是持續失敗。'
      ],
      options: [
        { label: '有通（穩定收到回覆）', next: 'end-ok', marks: { e2e: 'pass' },
          reason: 'PC0 已穩定收到 PC1 的回覆，表示去程與回程都可用，不需要再排查。' },
        { label: '不通（持續失敗）', next: 'gw', marks: { e2e: 'fail' },
          reason: '只看 ping 失敗，還不知道哪一段壞了。所以改成由近到遠逐段測試，先確認 PC0 到自己的閘道。' }
      ]
    },

    /* ---------- PC0 到本地閘道 ---------- */
    gw: {
      title: '測 PC0 到本地閘道',
      segment: 'gw',
      focus: ['pc0', 'r0'],
      where: 'PC0 → Desktop → Command Prompt',
      commands: ['ping 192.168.40.2'],
      observe: ['看有沒有收到 192.168.40.2 的回覆。這一步只測 PC0 和 R0 之間的第一段。'],
      options: [
        { label: '有通', next: 'pcgw', marks: { gw: 'pass' },
          reason: 'PC0 和 R0 的本地介面互通，但預設閘道可能沒填或填錯。同網段 ping 不需要閘道，要到別的網段才需要，所以要另外核對。' },
        { label: '不通', next: 'fix-gw', marks: { gw: 'fail' },
          reason: '連最近的閘道都到不了，後面的設定再正確也沒用，必須先修好 PC0 到 R0 這一段。' }
      ]
    },

    'fix-gw': {
      title: '修正 PC0 與 R0 本地介面',
      segment: 'gw',
      focus: ['pc0', 'r0'],
      where: '先在 PC0 檢查，再到 R0 檢查',
      commands: [
        { c: 'ipconfig', n: 'PC0 的 Command Prompt：看 IP、遮罩、預設閘道' },
        { c: 'show ip interface brief', n: 'R0 的 CLI（先輸入 enable）：看面向 PC0 的介面' }
      ],
      observe: [
        'PC0 的 IP 要是 192.168.40.x（x 不能和 192.168.40.2 重複），遮罩要與 R0 介面一致，例如 255.255.255.0。',
        'R0 面向 PC0 的介面要是 192.168.40.2，狀態為 up / up。若是 administratively down，到該介面輸入 no shutdown。',
        '接線也要看：連線兩端的燈是否為綠色，線材種類是否正確（PC 接路由器通常用交叉線）。'
      ],
      afterNote: '修正後，再測同一個閘道：在 PC0 執行 ping 192.168.40.2。',
      options: [
        { label: '修正後，ping 192.168.40.2 有通了', next: 'retest', marks: { gw: 'pass' },
          reason: 'PC0 到閘道已恢復。改完設定先回 PC0 重測原本的 PC1：有通就結束，仍不通再繼續往下查。' },
        { label: '修正後還是不通，繼續檢查', next: 'fix-gw', marks: { gw: 'fail' },
          reason: '這一段仍未恢復。請再核對 IP、遮罩、接線和 R0 介面狀態，一次只改一項，改完就重測。' },
        { label: '先記為「待驗證」，稍後再回來', next: 'end-pending', marks: {},
          reason: '先保留目前已測過的結果，之後可以再繼續。' }
      ]
    },

    /* ---------- PC0 預設閘道 ---------- */
    pcgw: {
      title: '核對 PC0 的預設閘道',
      segment: 'pcgw',
      focus: ['pc0'],
      where: 'PC0 → Desktop → IP Configuration（或 Command Prompt）',
      commands: ['ipconfig'],
      observe: ['Default Gateway 必須是 192.168.40.2。空白或填成別的位址，PC0 就不知道要把去 192.168.30.2 的封包交給誰。'],
      options: [
        { label: '預設閘道已是 192.168.40.2', next: 'link', marks: { pcgw: 'pass' },
          reason: 'PC0 這一側的設定正確，往下一段檢查 R0 到 R1 的互連。' },
        { label: '填錯或空白，我已改成 192.168.40.2', next: 'retest', marks: { pcgw: 'pass' },
          reason: '更改設定後要回到 PC0 重測原本的目標 PC1，確認問題是否解決。' }
      ]
    },

    /* ---------- R0 到 R1 ---------- */
    link: {
      title: '測 R0 到相鄰的 R1',
      segment: 'link',
      focus: ['r0', 'r1'],
      where: 'R0 → CLI',
      commands: [
        { c: 'enable', n: '進入特權模式（已在 R0# 可略過）' },
        'ping 10.0.0.2'
      ],
      observe: ['看有沒有收到 10.0.0.2 的回覆（驚嘆號 ! 代表成功，點 . 代表失敗）。'],
      options: [
        { label: '有通', next: 'r0route', marks: { link: 'pass' },
          reason: '兩台路由器的互連是通的，問題比較可能在路由表。下一步看 R0 有沒有去 PC1 網段的路由。' },
        { label: '不通', next: 'fix-link', marks: { link: 'fail' },
          reason: 'R0 連隔壁的 R1 都到不了，路由再正確封包也過不去，先修好互連介面與位址。' }
      ]
    },

    'fix-link': {
      title: '檢查 R0 與 R1 的互連介面',
      segment: 'link',
      focus: ['r0', 'r1'],
      where: 'R0 與 R1 的 CLI 都要看',
      commands: [
        { c: 'show ip interface brief', n: '分別在 R0 和 R1 輸入' }
      ],
      observe: [
        '互連介面的 Status 與 Protocol 都要是 up。若是 administratively down，到該介面輸入 no shutdown。',
        'R1 的互連介面應為 10.0.0.2，R0 的互連介面要與它在同一個子網路（例如 10.0.0.1，遮罩兩邊一致）。',
        '如果兩邊位址或遮罩對不上，修正後再測。'
      ],
      afterNote: '修正後，回到 R0 重測：ping 10.0.0.2。',
      options: [
        { label: '修正後，R0 ping 10.0.0.2 有通了', next: 'retest', marks: { link: 'pass' },
          reason: '互連已恢復。改完設定先回 PC0 重測原本的 PC1：有通就結束，仍不通再繼續往下查。' },
        { label: '修正後還是不通，繼續檢查', next: 'fix-link', marks: { link: 'fail' },
          reason: '互連仍未恢復，請再核對介面狀態、位址、遮罩和接線。' },
        { label: '先記為「待驗證」，稍後再回來', next: 'end-pending', marks: {},
          reason: '先保留目前已測過的結果。' }
      ]
    },

    /* ---------- 路由表 ---------- */
    r0route: {
      title: '查看 R0 的路由表',
      segment: 'r0route',
      focus: ['r0'],
      where: 'R0 → CLI',
      commands: ['show ip route'],
      observe: [
        '要找到去 PC1 網段 192.168.30.0/24 的路由。靜態路由會以 S 開頭，下一跳應為 10.0.0.2，例如 S 192.168.30.0/24 [1/0] via 10.0.0.2。',
        '如果只有 C（直連）的 192.168.40.0 和 10.0.0.0，而沒有 192.168.30.0，就是 R0 不知道往哪送。'
      ],
      options: [
        { label: '有 192.168.30.0/24 的路由', next: 'r1route', marks: { r0route: 'pass' },
          reason: 'R0 的去程路由正常。ping 要往返，所以接著看 R1 有沒有回程路由。' },
        { label: '沒有這條路由', next: 'fix-r0route', marks: { r0route: 'fail' },
          reason: 'R0 不知道 192.168.30.0/24 怎麼走，PC0 的封包到了 R0 就會被丟掉，需要補上去程路由。' }
      ]
    },

    'fix-r0route': {
      title: '在 R0 補上去程路由',
      segment: 'r0route',
      focus: ['r0'],
      where: 'R0 → CLI',
      commands: [
        'configure terminal',
        'ip route 192.168.30.0 255.255.255.0 10.0.0.2',
        'end',
        'show ip route'
      ],
      observe: [
        '再看一次路由表，確認出現 S 192.168.30.0/24 via 10.0.0.2。',
        '這是靜態路由的寫法；若你的拓樸使用 RIP 或 OSPF 等動態路由，請改檢查路由協定的設定。'
      ],
      afterNote: '更改設定後，回到 PC0 重測原本的 PC1。',
      options: [
        { label: '路由已出現，回 PC0 重測', next: 'retest', marks: { r0route: 'pass' },
          reason: '更改設定後，要回到 PC0 重測原本的目標 PC1。' }
      ]
    },

    r1route: {
      title: '查看 R1 的路由表',
      segment: 'r1route',
      focus: ['r1'],
      where: 'R1 → CLI',
      commands: ['show ip route'],
      observe: [
        '要找到回到 PC0 網段 192.168.40.0/24 的路由，下一跳應為 R0 的互連位址（例如 10.0.0.1）。',
        '若沒有，PC1 收得到 ping，卻不知道 Reply 要往哪送，在 PC0 看起來就是逾時。'
      ],
      options: [
        { label: '有 192.168.40.0/24 的路由', next: 'pc1', marks: { r1route: 'pass' },
          reason: '兩台路由器的去程與回程路由都正常，剩下的可能是 PC1 本身的設定。' },
        { label: '沒有這條路由', next: 'fix-r1route', marks: { r1route: 'fail' },
          reason: 'R1 不知道怎麼回到 192.168.40.0/24，回覆封包送不回來，需要補上回程路由。' }
      ]
    },

    'fix-r1route': {
      title: '在 R1 補上回程路由',
      segment: 'r1route',
      focus: ['r1'],
      where: 'R1 → CLI',
      commands: [
        'configure terminal',
        'ip route 192.168.40.0 255.255.255.0 10.0.0.1',
        'end',
        'show ip route'
      ],
      observe: [
        '再看一次路由表，確認出現 S 192.168.40.0/24 via 10.0.0.1。',
        '10.0.0.1 請換成你 R0 互連介面實際的位址。'
      ],
      afterNote: '更改設定後，回到 PC0 重測原本的 PC1。',
      options: [
        { label: '路由已出現，回 PC0 重測', next: 'retest', marks: { r1route: 'pass' },
          reason: '更改設定後，要回到 PC0 重測原本的目標 PC1。' }
      ]
    },

    /* ---------- PC1 ---------- */
    pc1: {
      title: '檢查 PC1 的設定',
      segment: 'pc1',
      focus: ['pc1', 'r1'],
      where: 'PC1 → Desktop → IP Configuration（或 Command Prompt）',
      commands: ['ipconfig'],
      observe: [
        'IP 應為 192.168.30.2，遮罩要與 R1 的 LAN 介面一致。',
        'Default Gateway 要填 R1 面向 PC1 的介面位址（通常與 PC1 同在 192.168.30.0/24）。',
        '若路由都正常，PC1 沒有閘道就無法把 Reply 送出本網段。'
      ],
      options: [
        { label: '發現設定有誤，已修正', next: 'retest', marks: { pc1: 'pass' },
          reason: '更改設定後，要回到 PC0 重測原本的目標 PC1。' },
        { label: 'PC1 設定都正確，但整體還是不通', next: 'end-pending', marks: { pc1: 'pass' },
          reason: '前面各段都沒有找到錯誤，這個案例的步驟已用完，需要進一步檢查（見下一頁）。' }
      ]
    },

    /* ---------- 最後驗證 ---------- */
    retest: {
      title: '回 PC0 重測 PC1',
      segment: 'e2e',
      focus: ['pc0', 'pc1'],
      where: 'PC0 → Desktop → Command Prompt',
      commands: ['ping 192.168.30.2'],
      observe: ['每次改完設定都回到這裡重測原本的目標。連續執行幾次，穩定收到回覆才算通。'],
      options: [
        { label: '有通（穩定收到回覆）', next: 'end-ok', marks: { e2e: 'pass' },
          reason: 'PC0 已收到 PC1 的回覆，往返路徑都可用。' },
        { label: '還是不通', next: 'resume', marks: { e2e: 'fail' },
          reason: '剛才的修正可能只解決了其中一個問題，還有別段沒修好。已測過的結果會保留，你可以接著查其他段。' }
      ]
    },

    resume: {
      title: '仍不通：選下一段繼續查',
      focus: [],
      where: '看一下頁面下方的「各段檢查狀態」',
      commands: [],
      observe: [
        '標示「待驗證」的段落是還沒測過的，優先從那裡查。',
        '標示「有問題」的段落，確認是否真的修好了。'
      ],
      options: [
        { label: '重測 PC0 到本地閘道', next: 'gw', marks: {}, reason: '回到最前面一段，重新測 PC0 ping 192.168.40.2。' },
        { label: '核對 PC0 的預設閘道', next: 'pcgw', marks: {}, reason: '確認 PC0 的 Default Gateway 是 192.168.40.2。' },
        { label: '重測 R0 到 R1', next: 'link', marks: {}, reason: '回到 R0 重新測 ping 10.0.0.2。' },
        { label: '查 R0 的去程路由', next: 'r0route', marks: {}, reason: '重新核對 R0 有沒有去 192.168.30.0/24 的路由。' },
        { label: '查 R1 的回程路由', next: 'r1route', marks: {}, reason: '重新核對 R1 有沒有回 192.168.40.0/24 的路由。' },
        { label: '查 PC1 的設定', next: 'pc1', marks: {}, reason: '核對 PC1 的 IP、遮罩和預設閘道。' },
        { label: '先記為「待驗證」', next: 'end-pending', marks: {}, reason: '先保留目前的測試紀錄。' }
      ]
    },

    'end-ok': {
      type: 'end',
      status: 'connected',
      title: '已連通',
      focus: ['pc0', 'r0', 'r1', 'pc1'],
      summary: 'PC0 已收到 PC1 的回覆。你可以看下方「本次測試紀錄」，回顧這次修了哪些地方。',
      points: [
        '不同網段的 ping 要成功，需要：PC 有正確的預設閘道、路由器有去程路由、對端路由器有回程路由。',
        '建議把這次修改的設定存起來（write memory），並記下原因。'
      ]
    },

    'end-pending': {
      type: 'end',
      status: 'pending',
      title: '待驗證',
      focus: [],
      summary: '目前還沒有確認連通。已測過的結果都保留在下方，沒測過的段落標為「待驗證」。',
      points: [
        '可以再確認：R1 面向 PC1 的 LAN 介面是否 up / up 且位址正確（show ip interface brief）。',
        '是否有存取控制清單擋住 ICMP（show access-lists）。',
        '各線材是否接在正確的介面上。'
      ],
      options: [
        { label: '繼續排查', next: 'resume', marks: {}, reason: '回到「選下一段繼續查」。' }
      ]
    }
  }
});
