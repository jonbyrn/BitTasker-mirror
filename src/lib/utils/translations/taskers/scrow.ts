export const taskersScrowTranslations = {
	en: {
		title: 'Bitcoin-Powered Escrow',
		subtitle:
			'Our Bitcoin escrow system protects both taskers and taskees throughout the entire task process.',
		guideTitle: 'Peace of Mind Payments: A Simple Guide to Escrow',
		guideIntro: `Think of our escrow as a <strong class="text-primary">smart, digital safe deposit box</strong> that holds the payment for a task until everyone agrees the job is done. It's designed to be fair, automatic, and secure, all powered by Bitcoin technology.`,
		step1Title: 'Step 1: Funding the Task',
		step1Text1: `When a Tasker hires a Taskee, they place the payment into the shared digital lockbox (escrow). From this moment on, the funds are safe and can only be moved when specific conditions are met. Neither the Tasker nor the Taskee can access the funds alone, but can access them at any point, provided they both agree on the outcome.`,
		step1Text2: `The escrow period is set to 14 days after the estimated task completion date, with the option to extend it if needed. At this point, if the Taskee has not marked the task as complete, the funds are automatically returned to the Tasker.`,
		step1Text3: `This escrow process is achieved through the use of a 2-of-2 multisig wallet, which requires both the Tasker and the Taskee to agree on the outcome of the task. As these agreements are made directly between the Tasker and Taskee, BitTasker is unable to intervene in the process, creating a true peer-to-peer escrow process.`,
		step2Title: 'Step 2: Completing the Task & Getting Paid',
		step2Text1: `Once the Taskee finishes the work, they mark the task as complete. The Tasker then reviews the work.`,
		step2List1: `<strong>If the Tasker is happy</strong>, they approve the payment, and the funds are instantly released from the escrow to the Taskee.`,
		step2List2: `<strong>Safety Net:</strong> If the Tasker doesn't take any action within 7 days, the system automatically releases the funds to the Taskee. This protects Taskees from unresponsive, or forgetful Taskers.`,
		whatIfTitle: 'What If Something Goes Wrong?',
		whatIfIntro: 'Our system has built-in rules to handle common issues automatically and fairly.',
		whatIfList1: `<strong>Cancellations:</strong> If the task is cancelled by either the Tasker or the Taskee for a valid reason, the money is returned to the Tasker. It's that simple.`,
		whatIfList2: `<strong>Changing the Job (Rescoping):</strong> If the job changes, the Taskee can initiate a "rescope." A small portion (10%) is released to the Taskee for their time, and the rest is returned to the Tasker to fund a new, updated task.`,
		whatIfList3: `<strong>Disputes:</strong> If the Tasker isn't satisfied, they can raise a dispute. The funds stay locked while both parties discuss a fair solution, like a partial refund. If they can't agree, the system follows a clear, time-based process that ultimately returns the funds to the Tasker. Depending on the dispute avenue and outcome, this takes place either 14 days, or 30 days after the dispute is raised.`,
		techTitle: 'Under the Hood: A Technical Look at Our Bitcoin Escrow',
		techIntro: `Our escrow system is built on the <strong class="text-primary">Liquid Network</strong>, a Bitcoin sidechain that enables fast, confidential transactions. We leverage <strong class="text-primary">2-of-2 multisignature wallets</strong>, cryptographic <strong class="text-primary">timelocks</strong>, and <strong class="text-primary">pre-signed transactions</strong> to create a fully automated, non-custodial, and trustless process.`,
		mechanismTitle: 'The Core Mechanism: 2-of-2 Multisig & Pre-Signed Transactions',
		mechanismText: `Every escrow wallet requires two signatures to authorize a transaction, ensuring no single party can control the funds. At each stage, the system generates pre-signed transactions for every possible outcome (e.g., payment, refund). These transactions are held off-chain and only become valid when a corresponding timelock expires, or the other party provides the second signature.`,
		lifecycleTitle: 'The Escrow Lifecycle',
		lifecycleList1: `<strong>Initial Setup:</strong> A Tasker funds a 2-of-2 multisig wallet. A pre-signed refund transaction is created with a 14-day timelock. If the Taskee is unresponsive, this ensures an automatic refund to the Tasker. The Taskee can also, at any time, agree to refund the Tasker (if either the Tasker or Taskee needs to cancel, for example).`,
		lifecycleList2: `<strong>Cancellation:</strong> If either party cancels, the platform facilitates the signing of a refund transaction, and the Tasker receives a full refund (platform fees are also refunded).`,
		lifecycleList3: `<strong>Task Completion:</strong> When the Taskee marks the task as done, funds move to a 2-of-2 “done wallet.” This new wallet has a 7-day timelock for automatic payment to the Taskee. The Tasker can co-sign the payment transaction at any time within this 7-day window and pay the Taskee immediately, or initiate a dispute.`,
		lifecycleList4: `<strong>Dispute Process:</strong>
<ul>
<li>If a dispute is opened, funds move to a “dispute wallet” with a 14-day timelock set to refund the Tasker. This is the default outcome if no agreement is reached.</li>
<li>Either party can propose a split by creating and single-signing a new transaction. If the other party agrees and signs, the new outcome is executed immediately.</li>
<li>If the first proposal is rejected, funds move to a final dispute wallet with a 30-day timelock favoring the Tasker. This serves as the final, unchangeable fallback to ensure resolution.</li>
</ul>`,
		lifecycleConclusion: `This system favors the Tasker as the Tasker ultimately has more to lose. However, it also forces the Tasker to wait to get refunded, incentivizing the Tasker to choose a fair outcome to avoid waiting the full escrow period.`,
		feesTitle: 'Platform Fees',
		feesText: `Platform fees are charged upon successful completion of a task (when the Tasker accepts or the 7-day timelock expires) and during dispute resolutions. Fees are fully refunded in the case of a valid cancellation.`
	},
	es: {
		title: 'Depósito en garantía impulsado por Bitcoin',
		subtitle:
			'Nuestro sistema de depósito en garantía con Bitcoin protege tanto a taskers como a taskees durante todo el proceso de la tarea.',
		guideTitle: 'Pagos con tranquilidad: Una guía simple sobre el depósito en garantía',
		guideIntro: `Piensa en nuestro depósito en garantía como una <strong class="text-primary">caja fuerte digital inteligente</strong> que mantiene el pago de una tarea hasta que todos estén de acuerdo en que el trabajo está hecho. Está diseñado para ser justo, automático y seguro, todo impulsado por la tecnología Bitcoin.`,
		step1Title: 'Paso 1: Financiando la tarea',
		step1Text1: `Cuando un Tasker contrata a un Taskee, coloca el pago en la caja fuerte digital compartida (depósito en garantía). Desde ese momento, los fondos están seguros y solo pueden moverse cuando se cumplen condiciones específicas. Ni el Tasker ni el Taskee pueden acceder a los fondos por sí solos, pero pueden acceder a ellos en cualquier momento, siempre que ambos estén de acuerdo con el resultado.`,
		step1Text2: `El período de depósito en garantía se establece en 14 días después de la fecha estimada de finalización de la tarea, con la opción de extenderlo si es necesario. En ese momento, si el Taskee no ha marcado la tarea como completada, los fondos se devuelven automáticamente al Tasker.`,
		step1Text3: `Este proceso de depósito en garantía se logra mediante el uso de una billetera multifirma 2-de-2, que requiere que tanto el Tasker como el Taskee estén de acuerdo con el resultado de la tarea. Como estos acuerdos se hacen directamente entre el Tasker y el Taskee, BitTasker no puede intervenir en el proceso, creando un verdadero proceso de depósito en garantía entre pares.`,
		step2Title: 'Paso 2: Completando la tarea y recibiendo el pago',
		step2Text1: `Una vez que el Taskee termina el trabajo, marca la tarea como completada. Luego, el Tasker revisa el trabajo.`,
		step2List1: `<strong>Si el Tasker está satisfecho</strong>, aprueba el pago y los fondos se liberan instantáneamente del depósito en garantía al Taskee.`,
		step2List2: `<strong>Red de seguridad:</strong> Si el Tasker no toma ninguna acción dentro de los 7 días, el sistema libera automáticamente los fondos al Taskee. Esto protege a los Taskees de Taskers que no responden o se olvidan.`,
		whatIfTitle: '¿Qué pasa si algo sale mal?',
		whatIfIntro:
			'Nuestro sistema tiene reglas integradas para manejar problemas comunes de forma automática y justa.',
		whatIfList1: `<strong>Cancelaciones:</strong> Si la tarea es cancelada por el Tasker o el Taskee por una razón válida, el dinero se devuelve al Tasker. Así de simple.`,
		whatIfList2: `<strong>Cambio de trabajo (Rescoping):</strong> Si el trabajo cambia, el Taskee puede iniciar un "rescope". Se libera una pequeña parte (10%) al Taskee por su tiempo, y el resto se devuelve al Tasker para financiar una nueva tarea actualizada.`,
		whatIfList3: `<strong>Disputas:</strong> Si el Tasker no está satisfecho, puede iniciar una disputa. Los fondos permanecen bloqueados mientras ambas partes discuten una solución justa, como un reembolso parcial. Si no logran llegar a un acuerdo, el sistema sigue un proceso claro basado en el tiempo que finalmente devuelve los fondos al Tasker. Dependiendo de la vía y el resultado de la disputa, esto ocurre a los 14 o 30 días después de que se inicia la disputa.`,
		techTitle: 'Bajo el capó: Una mirada técnica a nuestro depósito en garantía con Bitcoin',
		techIntro: `Nuestro sistema de depósito en garantía está construido sobre la <strong class="text-primary">Liquid Network</strong>, una cadena lateral de Bitcoin que permite transacciones rápidas y confidenciales. Utilizamos <strong class="text-primary">billeteras multifirma 2-de-2</strong>, <strong class="text-primary">bloqueos de tiempo criptográficos</strong> y <strong class="text-primary">transacciones pre-firmadas</strong> para crear un proceso totalmente automatizado, no custodial y sin confianza.`,
		mechanismTitle: 'El mecanismo principal: multifirma 2-de-2 y transacciones pre-firmadas',
		mechanismText: `Cada billetera de depósito en garantía requiere dos firmas para autorizar una transacción, asegurando que ninguna de las partes pueda controlar los fondos por sí sola. En cada etapa, el sistema genera transacciones pre-firmadas para cada posible resultado (por ejemplo, pago, reembolso). Estas transacciones se mantienen fuera de la cadena y solo se vuelven válidas cuando expira el bloqueo de tiempo correspondiente o la otra parte proporciona la segunda firma.`,
		lifecycleTitle: 'El ciclo de vida del depósito en garantía',
		lifecycleList1: `<strong>Configuración inicial:</strong> Un Tasker financia una billetera multifirma 2-de-2. Se crea una transacción de reembolso pre-firmada con un bloqueo de tiempo de 14 días. Si el Taskee no responde, esto garantiza un reembolso automático al Tasker. El Taskee también puede, en cualquier momento, acordar reembolsar al Tasker (si el Tasker o el Taskee necesitan cancelar, por ejemplo).`,
		lifecycleList2: `<strong>Cancelación:</strong> Si cualquiera de las partes cancela, la plataforma facilita la firma de una transacción de reembolso, y el Tasker recibe un reembolso completo (las tarifas de la plataforma también se reembolsan).`,
		lifecycleList3: `<strong>Finalización de la tarea:</strong> Cuando el Taskee marca la tarea como hecha, los fondos se mueven a una “billetera de finalización” 2-de-2. Esta nueva billetera tiene un bloqueo de tiempo de 7 días para el pago automático al Taskee. El Tasker puede co-firmar la transacción de pago en cualquier momento dentro de este período de 7 días y pagar al Taskee inmediatamente, o iniciar una disputa.`,
		lifecycleList4: `<strong>Proceso de disputa:</strong>
<ul>
<li>Si se abre una disputa, los fondos se mueven a una “billetera de disputa” con un bloqueo de tiempo de 14 días para reembolsar al Tasker. Este es el resultado predeterminado si no se llega a un acuerdo.</li>
<li>Cualquiera de las partes puede proponer una división creando y firmando individualmente una nueva transacción. Si la otra parte está de acuerdo y firma, el nuevo resultado se ejecuta inmediatamente.</li>
<li>Si la primera propuesta es rechazada, los fondos se mueven a una billetera de disputa final con un bloqueo de tiempo de 30 días a favor del Tasker. Esto sirve como el último recurso inalterable para garantizar la resolución.</li>
</ul>`,
		lifecycleConclusion: `Este sistema favorece al Tasker ya que es quien más puede perder. Sin embargo, también obliga al Tasker a esperar para recibir el reembolso, incentivándolo a elegir un resultado justo para evitar esperar todo el período de depósito en garantía.`,
		feesTitle: 'Tarifas de la plataforma',
		feesText: `Las tarifas de la plataforma se cobran al completar exitosamente una tarea (cuando el Tasker acepta o expira el bloqueo de tiempo de 7 días) y durante la resolución de disputas. Las tarifas se reembolsan completamente en caso de una cancelación válida.`
	}
};
