export const termsTranslations = {
	en: {
		'terms.title': 'Terms of Service',
		'terms.subtitle': 'This User Agreement governs your use of the BitTasker platform.',
		'terms.last_updated': 'Last Updated: July 13, 2025',

		'terms.intro':
			'By accessing or using the BitTasker platform, you agree to be bound by these Terms of Service, our <a href="/privacy" class="link link-primary">Privacy Policy</a>, and all applicable laws and regulations. If you do not agree with any part of these terms, you may not use our services.',

		'terms.definitions.title': '2. Definitions',
		'terms.definitions.intro': 'Throughout these Terms of Service, when we say:',
		'terms.definitions.bitTasker':
			'<strong>"BitTasker,"</strong> "we," "us," or "our" refers to BitTasker, the company that develops and maintains the BitTasker platform.',
		'terms.definitions.services':
			'<strong>"Services"</strong> refers to the features and functions provided by the BitTasker platform.',
		'terms.definitions.platform':
			'<strong>"Platform"</strong> refers to our website, mobile applications, and other related services.',
		'terms.definitions.user':
			'<strong>"User,"</strong> "you," or "your" refers to individuals who use our platform in any capacity.',
		'terms.definitions.tasker':
			'<strong>"Tasker,"</strong> refers to users who post tasks requesting services.',
		'terms.definitions.taskee':
			'<strong>"Taskee"</strong> refers to users who offer to perform services for Taskers.',
		'terms.definitions.task_contract':
			'<strong>"Task Contract"</strong> refers to the agreement formed between a Tasker and a Taskee when an offer is accepted.',
		'terms.definitions.nostr':
			'<strong>"Nostr"</strong> refers to the decentralized protocol that powers communications and identity on the BitTasker platform.',
		'terms.definitions.bitcoin':
			'<strong>"Bitcoin"</strong> refers to the cryptocurrency used for payments on the BitTasker platform, including on-chain, Lightning Network, and Liquid Network transactions.',
		'terms.definitions.service_fee':
			'<strong>"Service Fee"</strong> refers to the fee BitTasker charges for facilitating connections between Taskers and Taskees.',

		'terms.scope.title': '1. Scope of BitTasker Services',
		'terms.scope.subsection': '1.1 Basic Principles',
		'terms.scope.point1':
			'BitTasker provides a decentralized platform that enables Taskers to publish task requests and Taskees to make offers to complete these tasks.',
		'terms.scope.point2':
			'The platform uses the Nostr protocol for identity, data storage, and communications, with Bitcoin and fiat as payment methods.',
		'terms.scope.point3':
			"When a Tasker accepts a Taskee's offer, a Task Contract is created directly between these parties.",
		'terms.scope.point4':
			'Upon task completion and confirmation, funds are released from escrow to the Taskee.',
		'terms.scope.point5':
			'Both parties are encouraged to review and provide feedback after task completion, to help the community.', // Section 2
		'terms.role.title': "2. BitTasker's Role and Obligations",
		'terms.role.point1':
			'BitTasker provides the platform and technical infrastructure that enables the connection between Taskers and Taskees.',
		'terms.role.point2': 'BitTasker only permits individuals over 18 years of age to become Users.',
		'terms.role.point3':
			'BitTasker may refuse service or suspend accounts of users who violate these terms.',
		'terms.role.point4': 'As a decentralized application:',
		'terms.role.point4a':
			'BitTasker does not store your private keys or have access to your encrypted messages.',
		'terms.role.point4b': 'BitTasker cannot recover lost keys or passwords.',
		'terms.role.point4c':
			'BitTasker does not have the ability to reverse, or intervene, in transactions.',
		'terms.role.point5':
			'BitTasker accepts no liability for any aspect of the interaction between Taskers and Taskees, including but not limited to the description, performance, or delivery of services.',
		'terms.role.point6':
			'BitTasker is not responsible for and does not warrant the truth or accuracy of any information provided by Users.',
		'terms.role.point7':
			'The platform is provided "as is" and without any warranty or condition, express or implied.',

		// Section 3
		'terms.user.title': '3. User Obligations',
		'terms.user.intro': 'You will at all times:',
		'terms.user.point1':
			'Comply with these Terms of Service and all applicable laws and regulations.',
		'terms.user.point2': 'Only post accurate information on the BitTasker platform.',
		'terms.user.point3':
			'Be aware of and comply with any laws that apply to you as a Tasker or Taskee.',
		'terms.user.point4':
			'Be responsible for the security of your own Nostr private keys and Bitcoin wallet.',
		'terms.user.point5': 'Not use the BitTasker platform for any illegal or immoral purpose.',
		'terms.user.point6':
			'Not allow others to use your account or transfer your account to another person.',
		'terms.user.subintro': 'Any information you post on the BitTasker platform must not:',
		'terms.user.subpoint1': 'Be false, inaccurate, misleading, or deceptive.',
		'terms.user.subpoint2': 'Be fraudulent or involve counterfeit or stolen items.',
		'terms.user.subpoint3': "Infringe on any third party's intellectual property rights.",
		'terms.user.subpoint4': 'Violate any applicable laws or regulations.',
		'terms.user.subpoint5': 'Be defamatory, libelous, threatening, or harassing.',
		'terms.user.subpoint6': 'Contain obscene or inappropriate material.',
		'terms.user.subpoint7': 'Contain malicious code that could harm the platform or other users.', // Section 4 – Bitcoin Payments
		'terms.bitcoin.title': '4. Bitcoin Payments',
		'terms.bitcoin.point1':
			'Users acknowledge that Bitcoin transactions are irreversible and BitTasker cannot recover funds sent to incorrect addresses.',
		'terms.bitcoin.point2':
			'BitTasker uses multi-signature escrow for task payments to provide security for both parties.',
		'terms.bitcoin.point3':
			'When a Task Contract is created, the Tasker must deposit the agreed amount into escrow.',
		'terms.bitcoin.point4':
			'Service Fees are deducted from the task payment when funds are released from escrow.',
		'terms.bitcoin.point5':
			'Bitcoin price volatility: Both parties acknowledge that the value of Bitcoin can fluctuate and agree that once a price is set in Bitcoin for a task, it will not be adjusted due to price fluctuations.',
		'terms.bitcoin.point6':
			'Users are responsible for any taxes or regulatory compliance related to their transactions.',

		// Section 5 – Dynamic Fee Structure
		'terms.fees.title': '5. Dynamic Fee Structure',
		'terms.fees.point1':
			'BitTasker implements a level-based system that rewards active users with benefits.',
		'terms.fees.point2':
			'Users can earn levels by successfully completing tasks (as Taskees) or hiring Taskees (as Taskers).',
		'terms.fees.point3':
			'Higher levels may result in reduced Service Fees and additional platform privileges.',
		'terms.fees.point4':
			'The dynamic fee structure is designed to reward repeat business and active platform participation.',
		'terms.fees.point5': 'BitTasker reserves the right to modify the fee structure at any time.', // Section 6 – End-to-End Encryption
		'terms.encryption.title': '6. End-to-End Encryption and Privacy',
		'terms.encryption.point1': 'All direct messages between users are end-to-end encrypted.',
		'terms.encryption.point2': 'BitTasker cannot access the content of your private conversations.',
		'terms.encryption.point3':
			'Users are responsible for maintaining the security of their private keys.',
		'terms.encryption.point4':
			'If you lose access to your private keys, BitTasker cannot recover your encrypted messages or account.',
		'terms.encryption.point5': 'For more details on our privacy practices, please see our',
		'terms.encryption.privacy_link': 'Privacy Policy',

		// Section 7 – Multi-Language Support
		'terms.language.title': '7. Multi-Language Support',
		'terms.language.point1':
			'BitTasker offers automatic translation features to facilitate communication between users who speak different languages.',
		'terms.language.point2':
			'While we strive for accuracy, users acknowledge that automatic translations may not be perfect and could sometimes lead to misunderstandings.',
		'terms.language.point3':
			'In case of any discrepancy between different language versions of these Terms, the English version shall prevail.',
		'terms.language.point4':
			'To avoid any confusion, it is recommended to be as clear as possible in communications.',

		// Section 8 – Dispute Resolution
		'terms.disputes.title': '8. Dispute Resolution',
		'terms.disputes.point1':
			"In the event of a dispute between a Tasker and a Taskee, both parties must attempt to resolve the issue directly through the platform's messaging system.",
		'terms.disputes.point2':
			'If the parties cannot reach a resolution, our escrow system will be used to resolve the dispute.',
		'terms.disputes.point3':
			'Escrow is implemented with 2:2 multisig wallets where only the tasker and taskee have the keys.',
		'terms.disputes.point4':
			'Since BitTasker does not have access to your funds, we are unable to intervene in the event that a tasker and taskee have a dispute.',
		'terms.disputes.point5': 'See our detailed',
		'terms.disputes.escrow_link': 'escrow page', // Section 9 – Intellectual Property
		'terms.ip.title': '9. Intellectual Property',
		'terms.ip.point1':
			'The BitTasker name, logo, and platform are protected by intellectual property rights owned by BitTasker.',
		'terms.ip.point2':
			'You may not use our trademarks, logos, or other proprietary information without our prior written consent.',
		'terms.ip.point3':
			'Content you create and post on BitTasker remains your intellectual property, but you grant BitTasker a license to use, store, reproduce, and display such content for the purpose of providing and promoting the platform.',
		'terms.ip.point4':
			'This license is perpetual and ends when you delete your content from the platform, except in cases where your content has been shared with others who have not deleted it.',

		// Section 10 – Limitation of Liability
		'terms.liability.title': '10. Limitation of Liability',
		'terms.liability.point1':
			'To the maximum extent permitted by law, BitTasker and its affiliates, officers, directors, employees, agents, and licensors shall not be liable for any indirect, incidental, special, consequential, punitive, or exemplary damages, including but not limited to damages for loss of profits, goodwill, use, data, or other intangible losses, arising out of or relating to your use of the platform.',
		'terms.liability.point2':
			'This limitation applies whether the alleged liability is based on contract, tort, negligence, strict liability, or any other basis, even if BitTasker has been advised of the possibility of such damage.',
		'terms.liability.point3':
			"BitTasker's total liability to you for any and all claims arising out of or relating to these Terms or your use of the platform shall not exceed the greater of (a) the amount you have paid to BitTasker in service fees during the six months preceding the claim, or (b) one hundred dollars ($100).",
		'terms.liability.point4':
			'Some jurisdictions do not allow the exclusion or limitation of liability for consequential or incidental damages, so the above limitation may not apply to you. In such jurisdictions, our liability is limited to the greatest extent permitted by law.',
		'terms.liability.point5':
			'You acknowledge that the fees charged by BitTasker reflect the allocation of risk set forth in these Terms and that BitTasker would not enter into these Terms without these limitations on its liability.',

		// Section 11 – Indemnification
		'terms.indemnification.title': '11. Indemnification',
		'terms.indemnification.point1':
			"You agree to defend, indemnify, and hold harmless BitTasker, its affiliates, officers, directors, employees, agents, and licensors from and against any and all claims, damages, obligations, losses, liabilities, costs, and expenses (including reasonable attorney's fees) arising from:",
		'terms.indemnification.point2': 'Your use of the platform or services;',
		'terms.indemnification.point3': 'Your violation of these Terms;',
		'terms.indemnification.point4':
			"Your violation of any third party's rights, including intellectual property rights;",
		'terms.indemnification.point5': 'Your conduct in connection with the platform;',
		'terms.indemnification.point6': 'Any Task Contract you enter into;',
		'terms.indemnification.point7':
			'Any content you post or transmit through the platform. BitTasker reserves the right to assume the exclusive defense and control of any matter otherwise subject to indemnification by you, in which event you will cooperate with BitTasker in asserting any available defenses.', // 12. Class Action Waiver
		'terms.classWaiver.title': '12. Class Action Waiver',
		'terms.classWaiver.point1.label': 'Individual Disputes Only:',
		'terms.classWaiver.point1.text':
			'You and BitTasker agree that any dispute resolution proceeding will be conducted only on an individual basis and not in a class, consolidated, or representative action.',
		'terms.classWaiver.point2.label': 'No Class Actions:',
		'terms.classWaiver.point2.text':
			'You agree not to participate in or attempt to participate in a class action, collective action, or other representative action against BitTasker.',
		'terms.classWaiver.point3.label': 'Waiver of Jury Trial:',
		'terms.classWaiver.point3.text':
			'You and BitTasker each waive any right to a jury trial in any proceeding arising out of or relating to these Terms.',
		'terms.classWaiver.point4.label': 'Severability:',
		'terms.classWaiver.point4.text':
			'If any portion of this arbitration or class action waiver provision is deemed invalid or unenforceable, the remainder of this section shall remain in force. However, if the class action waiver is found to be invalid or unenforceable, then the entirety of this arbitration provision shall be null and void.',
		'terms.classWaiver.point5.label': 'Opt-Out:',
		'terms.classWaiver.point5.text':
			'You may opt out of this arbitration agreement within 30 days of first accepting these Terms by sending written notice to our contact page with your name, address, and a clear statement that you wish to opt out of the arbitration agreement.',

		// 13. Termination
		'terms.termination.title': '13. Termination',
		'terms.termination.point1':
			'BitTasker may terminate or suspend your access to the platform at any time, with or without cause, and with or without notice.',
		'terms.termination.point2':
			'You may terminate your account at any time by discontinuing use of the platform and closing your account.',
		'terms.termination.point3':
			'Upon termination, your right to use the platform will cease immediately. Task Contracts and obligations survive termination.',
		'terms.termination.point4':
			'Terms that should survive termination include ownership, warranties, indemnities, limitations of liability, disputes, and class action waiver.',
		'terms.termination.point5': 'BitTasker shall not be liable for any termination of your access.',

		// 14. Disclaimers and Warranties
		'terms.disclaimers.title': '14. Disclaimers and Warranties',
		'terms.disclaimers.point1.label': 'No Warranties:',
		'terms.disclaimers.point1.text':
			'The platform is provided "as is" and "as available" without warranties of any kind, express or implied.',
		'terms.disclaimers.point2.label': 'No Guarantee of Service:',
		'terms.disclaimers.point2.text':
			'BitTasker does not guarantee uninterrupted or error-free access. We don’t warrant defect correction or freedom from harmful components.',
		'terms.disclaimers.point3.label': 'Third-Party Content:',
		'terms.disclaimers.point3.text':
			'BitTasker disclaims all warranties related to third-party or user-posted content.',
		'terms.disclaimers.point4.label': 'Cryptocurrency Risks:',
		'terms.disclaimers.point4.text':
			'Cryptocurrencies involve risks such as volatility, regulation, and technical failures. BitTasker offers no guarantees.',
		'terms.disclaimers.point5.label': 'User Interactions:',
		'terms.disclaimers.point5.text':
			'BitTasker makes no warranty regarding user-posted info or task quality.',

		// 15. Force Majeure
		'terms.forceMajeure.title': '15. Force Majeure',
		'terms.forceMajeure.point1':
			'BitTasker is not liable for failures due to events beyond its control including natural disasters, war, terrorism, or regulatory action.',
		'terms.forceMajeure.point2':
			'During a force majeure event, BitTasker’s obligations are suspended for its duration.', // 16. Changes to Terms
		'terms.changes.title': '16. Changes to Terms',
		'terms.changes.point1':
			'BitTasker may modify these Terms at any time by posting the revised terms on the platform with a new "Last Updated" date.',
		'terms.changes.point2':
			'Your continued use of the platform after such changes constitutes your acceptance of the new Terms.',
		'terms.changes.point3':
			'If you do not agree to the modified terms, you must discontinue use of the platform and may be entitled to a refund of any prepaid fees, subject to these Terms.',

		// 17. Governing Law
		'terms.law.title': '17. Governing Law',
		'terms.law.point1':
			'These Terms shall be governed by and construed in accordance with the laws of El Salvador, without regard to its conflict of law provisions.',
		'terms.law.point2':
			'Any legal action or proceeding arising out of these Terms that is not subject to arbitration shall be brought exclusively in the courts located in El Salvador, and you consent to the jurisdiction of such courts.',
		'terms.law.point3':
			'Notwithstanding the foregoing, certain consumer protection laws may apply to your use of the platform regardless of this governing law provision.',

		// 18. Severability
		'terms.severability.title': '18. Severability',
		'terms.severability.point1':
			'If any provision of these Terms is held to be invalid, illegal, or unenforceable, the validity, legality, and enforceability of the remaining provisions shall not be affected or impaired thereby.',
		'terms.severability.point2':
			'In such case, the parties shall replace the invalid, illegal, or unenforceable provision with a valid, legal, and enforceable provision that achieves the same or similar economic effect.',
		'terms.entire_agreement.title': '19. Entire Agreement',
		'terms.entire_agreement.point1':
			'These Terms, together with our Privacy Policy and any additional terms that apply to specific features of the platform, constitute the entire agreement between you and BitTasker regarding your use of the platform.',
		'terms.entire_agreement.point2':
			'These Terms supersede all prior agreements, understandings, and communications between you and BitTasker regarding the subject matter hereof.',

		'terms.contact_info.title': '20. Contact Information',
		'terms.contact_info.point1':
			'If you have any questions about these Terms, please contact us at <a href="/contact" class="link link-primary">our contact page</a>.',
		'terms.contact_info.point2':
			'For legal notices, including opt-out notices for arbitration, please send written correspondence to: BitTasker Legal Department, via our contact page.'
	},
	es: {
		'terms.title': 'Términos de Servicio',
		'terms.subtitle': 'Este Acuerdo de Usuario rige el uso de la plataforma BitTasker.',
		'terms.last_updated': 'Última actualización: 13 de julio de 2025',

		'terms.intro':
			'Al acceder o utilizar la plataforma BitTasker, aceptas estar sujeto a estos Términos del Servicio, nuestra <a href="/privacy" class="link link-primary">Política de Privacidad</a>, y todas las leyes y regulaciones aplicables. Si no estás de acuerdo con alguna parte de estos términos, no podrás utilizar nuestros servicios.',

		'terms.definitions.title': '2. Definiciones',
		'terms.definitions.intro': 'A lo largo de estos Términos de Servicio, cuando decimos:',
		'terms.definitions.bitTasker':
			'<strong>"BitTasker,"</strong> "nosotros," "nos" o "nuestro" se refiere a BitTasker, la empresa que desarrolla y mantiene la plataforma BitTasker.',
		'terms.definitions.services':
			'<strong>"Servicios"</strong> se refiere a las funciones y características proporcionadas por la plataforma BitTasker.',
		'terms.definitions.platform':
			'<strong>"Plataforma"</strong> se refiere a nuestro sitio web, aplicaciones móviles y otros servicios relacionados.',
		'terms.definitions.user':
			'<strong>"Usuario,"</strong> "tú" o "tu" se refiere a personas que utilizan nuestra plataforma en cualquier capacidad.',
		'terms.definitions.tasker':
			'<strong>"Solicitante"</strong> se refiere a los usuarios que publican tareas solicitando servicios.',
		'terms.definitions.taskee':
			'<strong>"Ejecutor"</strong> se refiere a los usuarios que se ofrecen a realizar servicios para los Solicitantes.',
		'terms.definitions.task_contract':
			'<strong>"Contrato de Tarea"</strong> se refiere al acuerdo que se forma entre un Solicitante y un Ejecutor cuando se acepta una oferta.',
		'terms.definitions.nostr':
			'<strong>"Nostr"</strong> se refiere al protocolo descentralizado que impulsa las comunicaciones y la identidad en la plataforma BitTasker.',
		'terms.definitions.bitcoin':
			'<strong>"Bitcoin"</strong> se refiere a la criptomoneda utilizada para pagos en la plataforma BitTasker, incluyendo transacciones on-chain, en Lightning Network y en Liquid Network.',
		'terms.definitions.service_fee':
			'<strong>"Comisión por Servicio"</strong> se refiere a la tarifa que BitTasker cobra por facilitar conexiones entre Solicitantes y Ejecutores.',

		'terms.scope.title': '1. Alcance de los Servicios de BitTasker',
		'terms.scope.subsection': '1.1 Principios Básicos',
		'terms.scope.point1':
			'BitTasker ofrece una plataforma descentralizada que permite a los Taskers publicar solicitudes de tareas y a los Taskees ofrecerse para realizarlas.',
		'terms.scope.point2':
			'La plataforma utiliza el protocolo Nostr para identidad, almacenamiento de datos y comunicaciones, con Bitcoin y moneda fiat como métodos de pago.',
		'terms.scope.point3':
			'Cuando un Tasker acepta la oferta de un Taskee, se crea un Contrato de Tarea directamente entre ambas partes.',
		'terms.scope.point4':
			'Al completarse y confirmarse la tarea, los fondos se liberan del escrow al Taskee.',
		'terms.scope.point5':
			'Se alienta a ambas partes a dejar reseñas y comentarios después de la finalización de la tarea para beneficiar a la comunidad.', // Sección 2
		'terms.role.title': '2. Rol y Obligaciones de BitTasker',
		'terms.role.point1':
			'BitTasker proporciona la plataforma e infraestructura técnica que permite la conexión entre Taskers y Taskees.',
		'terms.role.point2':
			'BitTasker solo permite que personas mayores de 18 años se registren como Usuarios.',
		'terms.role.point3':
			'BitTasker puede negar el servicio o suspender cuentas de usuarios que violen estos términos.',
		'terms.role.point4': 'Como una aplicación descentralizada:',
		'terms.role.point4a':
			'BitTasker no almacena tus claves privadas ni tiene acceso a tus mensajes cifrados.',
		'terms.role.point4b': 'BitTasker no puede recuperar claves o contraseñas perdidas.',
		'terms.role.point4c':
			'BitTasker no tiene la capacidad de revertir ni intervenir en transacciones.',
		'terms.role.point5':
			'BitTasker no asume responsabilidad alguna por la interacción entre Taskers y Taskees, incluyendo pero no limitado a la descripción, ejecución o entrega de servicios.',
		'terms.role.point6':
			'BitTasker no es responsable ni garantiza la veracidad o exactitud de la información proporcionada por los Usuarios.',
		'terms.role.point7':
			'La plataforma se proporciona "tal cual" y sin ninguna garantía o condición, expresa o implícita.',

		// Sección 3
		'terms.user.title': '3. Obligaciones del Usuario',
		'terms.user.intro': 'Tú debes en todo momento:',
		'terms.user.point1':
			'Cumplir con estos Términos de Servicio y todas las leyes y regulaciones aplicables.',
		'terms.user.point2': 'Publicar únicamente información precisa en la plataforma BitTasker.',
		'terms.user.point3':
			'Conocer y cumplir con cualquier ley que aplique a ti como Tasker o Taskee.',
		'terms.user.point4':
			'Ser responsable de la seguridad de tus claves privadas de Nostr y tu billetera Bitcoin.',
		'terms.user.point5': 'No utilizar la plataforma BitTasker para fines ilegales o inmorales.',
		'terms.user.point6':
			'No permitir que otros usen tu cuenta ni transferir tu cuenta a otra persona.',
		'terms.user.subintro':
			'Cualquier información que publiques en la plataforma BitTasker no debe:',
		'terms.user.subpoint1': 'Ser falsa, inexacta, engañosa o confusa.',
		'terms.user.subpoint2': 'Ser fraudulenta o involucrar artículos falsificados o robados.',
		'terms.user.subpoint3': 'Infringir los derechos de propiedad intelectual de terceros.',
		'terms.user.subpoint4': 'Violar cualquier ley o regulación aplicable.',
		'terms.user.subpoint5': 'Ser difamatoria, calumniosa, amenazante o acosadora.',
		'terms.user.subpoint6': 'Contener material obsceno o inapropiado.',
		'terms.user.subpoint7':
			'Contener código malicioso que pueda dañar la plataforma u otros usuarios.', // Sección 4 – Pagos con Bitcoin
		'terms.bitcoin.title': '4. Pagos con Bitcoin',
		'terms.bitcoin.point1':
			'Los usuarios reconocen que las transacciones con Bitcoin son irreversibles y que BitTasker no puede recuperar fondos enviados a direcciones incorrectas.',
		'terms.bitcoin.point2':
			'BitTasker utiliza un sistema de escrow con múltiples firmas para los pagos de tareas, brindando seguridad a ambas partes.',
		'terms.bitcoin.point3':
			'Cuando se crea un Contrato de Tarea, el Tasker debe depositar el monto acordado en el escrow.',
		'terms.bitcoin.point4':
			'Las tarifas de servicio se deducen del pago de la tarea cuando los fondos se liberan del escrow.',
		'terms.bitcoin.point5':
			'Volatilidad del precio del Bitcoin: ambas partes reconocen que el valor del Bitcoin puede fluctuar y acuerdan que, una vez establecido un precio en Bitcoin para una tarea, este no será ajustado por cambios de precio.',
		'terms.bitcoin.point6':
			'Los usuarios son responsables de cualquier impuesto o cumplimiento normativo relacionado con sus transacciones.',

		// Sección 5 – Estructura Dinámica de Tarifas
		'terms.fees.title': '5. Estructura Dinámica de Tarifas',
		'terms.fees.point1':
			'BitTasker implementa un sistema de niveles que recompensa a los usuarios activos con beneficios.',
		'terms.fees.point2':
			'Los usuarios pueden subir de nivel completando tareas exitosamente (como Taskees) o contratando Taskees (como Taskers).',
		'terms.fees.point3':
			'Los niveles más altos pueden resultar en tarifas de servicio reducidas y privilegios adicionales dentro de la plataforma.',
		'terms.fees.point4':
			'La estructura dinámica de tarifas está diseñada para incentivar la participación activa y la recurrencia de tareas.',
		'terms.fees.point5':
			'BitTasker se reserva el derecho de modificar la estructura de tarifas en cualquier momento.', // Sección 6 – Cifrado de Extremo a Extremo
		'terms.encryption.title': '6. Cifrado de Extremo a Extremo y Privacidad',
		'terms.encryption.point1':
			'Todos los mensajes directos entre usuarios están cifrados de extremo a extremo.',
		'terms.encryption.point2':
			'BitTasker no puede acceder al contenido de tus conversaciones privadas.',
		'terms.encryption.point3':
			'Los usuarios son responsables de mantener la seguridad de sus claves privadas.',
		'terms.encryption.point4':
			'Si pierdes acceso a tus claves privadas, BitTasker no puede recuperar tus mensajes cifrados ni tu cuenta.',
		'terms.encryption.point5':
			'Para más detalles sobre nuestras prácticas de privacidad, consulta nuestra',
		'terms.encryption.privacy_link': 'Política de Privacidad',

		// Sección 7 – Soporte Multilingüe
		'terms.language.title': '7. Soporte Multilingüe',
		'terms.language.point1':
			'BitTasker ofrece funciones de traducción automática para facilitar la comunicación entre usuarios que hablan diferentes idiomas.',
		'terms.language.point2':
			'Aunque procuramos precisión, los usuarios reconocen que las traducciones automáticas pueden no ser perfectas y pueden causar malentendidos.',
		'terms.language.point3':
			'En caso de discrepancias entre versiones de estos términos en diferentes idiomas, prevalecerá la versión en inglés.',
		'terms.language.point4':
			'Para evitar confusiones, se recomienda comunicarse con la mayor claridad posible.',

		// Sección 8 – Resolución de Disputas
		'terms.disputes.title': '8. Resolución de Disputas',
		'terms.disputes.point1':
			'En caso de disputa entre un Tasker y un Taskee, ambas partes deben intentar resolver el problema directamente a través del sistema de mensajería de la plataforma.',
		'terms.disputes.point2':
			'Si no se llega a una resolución, se utilizará nuestro sistema de escrow para resolver la disputa.',
		'terms.disputes.point3':
			'El escrow se implementa con monederos multifirma 2:2 donde solo el tasker y el taskee tienen las llaves.',
		'terms.disputes.point4':
			'Dado que BitTasker no tiene acceso a tus fondos, no podemos intervenir si surge una disputa.',
		'terms.disputes.point5': 'Consulta nuestra página de',
		'terms.disputes.escrow_link': 'escrow', // Sección 9 – Propiedad Intelectual
		'terms.ip.title': '9. Propiedad Intelectual',
		'terms.ip.point1':
			'El nombre, logo y plataforma de BitTasker están protegidos por derechos de propiedad intelectual pertenecientes a BitTasker.',
		'terms.ip.point2':
			'No puedes usar nuestras marcas registradas, logotipos u otra información propietaria sin nuestro consentimiento previo por escrito.',
		'terms.ip.point3':
			'El contenido que creas y publicas en BitTasker sigue siendo tu propiedad intelectual, pero otorgas a BitTasker una licencia para usar, almacenar, reproducir y mostrar dicho contenido con el fin de proporcionar y promover la plataforma.',
		'terms.ip.point4':
			'Esta licencia es perpetua y finaliza cuando eliminas tu contenido de la plataforma, excepto en los casos en que dicho contenido haya sido compartido con otros que aún no lo han eliminado.',

		// Sección 10 – Limitación de Responsabilidad
		'terms.liability.title': '10. Limitación de Responsabilidad',
		'terms.liability.point1':
			'En la máxima medida permitida por la ley, BitTasker y sus afiliados, directores, empleados, agentes y licenciantes no serán responsables por daños indirectos, incidentales, especiales, consecuenciales, punitivos o ejemplares, incluyendo pero no limitado a pérdida de ganancias, buena voluntad, uso, datos u otras pérdidas intangibles, que surjan del uso de la plataforma.',
		'terms.liability.point2':
			'Esta limitación aplica independientemente de que la supuesta responsabilidad se base en contrato, agravio, negligencia, responsabilidad estricta o cualquier otra causa, incluso si BitTasker fue advertido sobre la posibilidad de tales daños.',
		'terms.liability.point3':
			'La responsabilidad total de BitTasker hacia ti por todas las reclamaciones relacionadas con estos Términos o tu uso de la plataforma no excederá el mayor de: (a) el monto que has pagado a BitTasker en tarifas de servicio durante los seis meses anteriores a la reclamación, o (b) cien dólares estadounidenses ($100).',
		'terms.liability.point4':
			'Algunas jurisdicciones no permiten la exclusión o limitación de responsabilidad por daños consecuenciales o incidentales, por lo tanto esta limitación puede no aplicarte. En esas jurisdicciones, nuestra responsabilidad se limita en la mayor medida permitida por la ley.',
		'terms.liability.point5':
			'Reconoces que las tarifas cobradas por BitTasker reflejan la asignación de riesgos establecida en estos Términos y que BitTasker no aceptaría estos Términos sin estas limitaciones de responsabilidad.',

		// Sección 11 – Indemnización
		'terms.indemnification.title': '11. Indemnización',
		'terms.indemnification.point1':
			'Aceptas defender, indemnizar y eximir de responsabilidad a BitTasker, sus afiliados, directores, empleados, agentes y licenciantes ante cualquier reclamación, daño, obligación, pérdida, responsabilidad, costo y gasto (incluyendo honorarios razonables de abogados) que surjan de:',
		'terms.indemnification.point2': 'Tu uso de la plataforma o los servicios;',
		'terms.indemnification.point3': 'Tu violación de estos Términos;',
		'terms.indemnification.point4':
			'Tu violación de los derechos de terceros, incluidos los derechos de propiedad intelectual;',
		'terms.indemnification.point5': 'Tu conducta en relación con la plataforma;',
		'terms.indemnification.point6': 'Cualquier Contrato de Tarea que celebres;',
		'terms.indemnification.point7':
			'Cualquier contenido que publiques o transmitas a través de la plataforma. BitTasker se reserva el derecho de asumir la defensa exclusiva de cualquier asunto sujeto a indemnización por tu parte, en cuyo caso cooperarás con BitTasker para presentar cualquier defensa disponible.', // 12. Renuncia a acciones colectivas
		'terms.classWaiver.title': '12. Renuncia a acciones colectivas',
		'terms.classWaiver.point1.label': 'Solo disputas individuales:',
		'terms.classWaiver.point1.text':
			'Tú y BitTasker acuerdan que cualquier disputa se resolverá de manera individual, no mediante acciones colectivas o representativas.',
		'terms.classWaiver.point2.label': 'Sin acciones colectivas:',
		'terms.classWaiver.point2.text':
			'Aceptas no participar ni intentar participar en una acción colectiva contra BitTasker.',
		'terms.classWaiver.point3.label': 'Renuncia a juicio con jurado:',
		'terms.classWaiver.point3.text':
			'Tú y BitTasker renuncian al derecho a un juicio con jurado en cualquier procedimiento relacionado con estos Términos.',
		'terms.classWaiver.point4.label': 'Divisibilidad:',
		'terms.classWaiver.point4.text':
			'Si alguna parte de esta disposición de arbitraje o renuncia a acción colectiva se considera inválida, el resto seguirá vigente. Si se invalida la renuncia a acción colectiva, toda la disposición será nula.',
		'terms.classWaiver.point5.label': 'Opción de exclusión:',
		'terms.classWaiver.point5.text':
			'Puedes optar por excluirte de este acuerdo de arbitraje dentro de los 30 días posteriores a la aceptación de estos Términos enviando una notificación escrita a nuestra página de contacto con tu nombre, dirección y una declaración clara de que deseas excluirte.',

		// 13. Terminación
		'terms.termination.title': '13. Terminación',
		'terms.termination.point1':
			'BitTasker puede suspender o cancelar tu acceso en cualquier momento, con o sin causa, y con o sin previo aviso.',
		'terms.termination.point2':
			'Puedes cancelar tu cuenta en cualquier momento dejando de usar la plataforma y cerrando tu cuenta.',
		'terms.termination.point3':
			'Al cancelar, cesa inmediatamente tu derecho a usar la plataforma. Los contratos de tarea vigentes sobreviven.',
		'terms.termination.point4':
			'Sobreviven cláusulas como propiedad, renuncias, indemnización, limitación de responsabilidad, resolución de disputas y renuncia colectiva.',
		'terms.termination.point5':
			'BitTasker no es responsable ante ti ni terceros por la terminación de tu acceso.',

		// 14. Renuncias y garantías
		'terms.disclaimers.title': '14. Renuncias y garantías',
		'terms.disclaimers.point1.label': 'Sin garantías:',
		'terms.disclaimers.point1.text':
			'La plataforma se proporciona "tal cual" y "según disponibilidad", sin garantías expresas ni implícitas.',
		'terms.disclaimers.point2.label': 'Sin garantía de servicio:',
		'terms.disclaimers.point2.text':
			'BitTasker no garantiza acceso continuo, libre de errores o seguro. No garantiza la corrección de defectos.',
		'terms.disclaimers.point3.label': 'Contenido de terceros:',
		'terms.disclaimers.point3.text':
			'BitTasker no garantiza la precisión ni la responsabilidad sobre contenido de terceros o usuarios.',
		'terms.disclaimers.point4.label': 'Riesgos de criptomonedas:',
		'terms.disclaimers.point4.text':
			'Reconoces que el uso de criptomonedas implica riesgos como volatilidad, cambios regulatorios y fallas técnicas.',
		'terms.disclaimers.point5.label': 'Interacciones entre usuarios:',
		'terms.disclaimers.point5.text':
			'BitTasker no garantiza la veracidad de la información ni la calidad de los servicios prestados.',

		// 15. Fuerza mayor
		'terms.forceMajeure.title': '15. Fuerza mayor',
		'terms.forceMajeure.point1':
			'BitTasker no es responsable por incumplimientos debidos a causas fuera de su control, como desastres naturales, guerras o pandemias.',
		'terms.forceMajeure.point2':
			'Durante un evento de fuerza mayor, las obligaciones de BitTasker se suspenden mientras dure el evento.',

		// 16. Cambios en los Términos
		'terms.changes.title': '16. Cambios en los Términos',
		'terms.changes.point1':
			'BitTasker puede modificar estos Términos en cualquier momento publicando los términos revisados en la plataforma con una nueva fecha de "Última actualización".',
		'terms.changes.point2':
			'El uso continuado de la plataforma después de dichos cambios constituye tu aceptación de los nuevos Términos.',
		'terms.changes.point3':
			'Si no estás de acuerdo con los términos modificados, debes dejar de usar la plataforma y podrías tener derecho a un reembolso de las tarifas pagadas por adelantado, sujeto a estos Términos.',

		// 17. Legislación Aplicable
		'terms.law.title': '17. Legislación Aplicable',
		'terms.law.point1':
			'Estos Términos se regirán e interpretarán de acuerdo con las leyes de El Salvador, sin considerar sus disposiciones sobre conflictos de leyes.',
		'terms.law.point2':
			'Cualquier acción legal que no esté sujeta a arbitraje deberá presentarse exclusivamente en los tribunales ubicados en El Salvador, y aceptas la jurisdicción de dichos tribunales.',
		'terms.law.point3':
			'Sin perjuicio de lo anterior, ciertas leyes de protección al consumidor pueden aplicarse independientemente de esta disposición de ley aplicable.',

		// 18. Divisibilidad
		'terms.severability.title': '18. Divisibilidad',
		'terms.severability.point1':
			'Si alguna disposición de estos Términos se considera inválida, ilegal o inaplicable, la validez y aplicabilidad del resto no se verá afectada.',
		'terms.severability.point2':
			'En tal caso, las partes reemplazarán dicha disposición con una válida y aplicable que logre el mismo o similar efecto económico.',
		'terms.entire_agreement.title': '19. Acuerdo Completo',
		'terms.entire_agreement.point1':
			'Estos Términos, junto con nuestra Política de Privacidad y cualquier término adicional que aplique a funciones específicas de la plataforma, constituyen el acuerdo completo entre tú y BitTasker respecto al uso de la plataforma.',
		'terms.entire_agreement.point2':
			'Estos Términos reemplazan todos los acuerdos, entendimientos y comunicaciones previas entre tú y BitTasker sobre el mismo tema.',

		'terms.contact_info.title': '20. Información de Contacto',
		'terms.contact_info.point1':
			'Si tienes preguntas sobre estos Términos, por favor contáctanos en <a href="/contact" class="link link-primary">nuestra página de contacto</a>.',
		'terms.contact_info.point2':
			'Para notificaciones legales, incluyendo la opción de excluirse del arbitraje, por favor envía tu correspondencia al Departamento Legal de BitTasker, vía nuestra página de contacto.'
	}
};
