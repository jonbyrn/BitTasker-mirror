export const securityTranslations = {
	en: {
		'about.security.title': 'Security First',
		'about.security.description':
			'How we secure your account, protect your data, and keep both taskers and taskees safe on our platform.',
		'about.security_approach.title': 'Our Security Approach',
		'about.security_approach.description':
			'BitTasker takes a fundamentally different approach to security compared to traditional platforms. Instead of asking you to trust us with your sensitive information, we have built systems where you maintain control of your own security.',
		'about.security_approach.alert_title': 'Important Security Disclaimer',
		'about.security_approach.alert_text':
			'While we implement industry-standard security measures, no system is completely immune to security risks. Users are responsible for following security best practices and maintaining the security of their own devices and accounts. BitTasker cannot guarantee absolute security and is not liable for security breaches resulting from user negligence or third-party vulnerabilities.',
		'about.security_passkeys.title': 'Passkeys, Not Passwords',
		'about.security_passkeys.description':
			"We've implemented passkey authentication, which provides enhanced security compared to traditional passwords. Passkeys use public-key cryptography to create unique authentication credentials that remain on your device.",
		'about.security_passkeys.point_1': 'Designed to resist password-based attacks',
		'about.security_passkeys.point_2': 'No shared secrets stored on our servers',
		'about.security_passkeys.point_3': 'Biometric verification on supported devices',
		'about.security_passkeys.point_4': 'FIDO2 standard compliance where supported',
		'about.security_passkeys.alert_title': 'User Responsibility',
		'about.security_passkeys.alert_text':
			"Passkey security depends on your device's security. Keep your device updated and secure to maintain the effectiveness of this authentication method.", // Account Recovery
		'about.security_recovery.title': 'Account Recovery System',
		'about.security_recovery.description':
			'We provide email-based recovery options for situations where passkeys become inaccessible. Our recovery system is designed to balance security with accessibility.',
		'about.security_recovery.point_1': 'Email verification with recovery authentication',
		'about.security_recovery.point_2': 'Multi-factor authentication during recovery',
		'about.security_recovery.point_3': 'Time-limited recovery processes',
		'about.security_recovery.point_4': 'Security monitoring during recovery attempts',
		'about.security_recovery.alert_title': 'User Responsibility',
		'about.security_recovery.alert_text':
			'Account recovery security depends on your email security. Use strong email security practices and two-factor authentication on your recovery email account.',

		// Client-Side Encryption
		'about.security_encryption.title': 'Client-Side Encryption',
		'about.security_encryption.description':
			'Your Bitcoin wallet and Nostr private keys are encrypted on your device using your authentication credentials before synchronization with our servers.',
		'about.security_encryption.point_1': 'Keys are stored in encrypted format',
		'about.security_encryption.point_2': 'BitTasker does not have access to your private keys',
		'about.security_encryption.point_3': 'Encryption occurs on your device',
		'about.security_encryption.point_4': 'Industry-standard encryption protocols',
		'about.security_encryption.alert_title': 'User Responsibility',
		'about.security_encryption.alert_text':
			'If you lose access to your authentication credentials, we cannot recover your encrypted keys. Maintain secure backups of your recovery information.',

		// Bitcoin Wallet Security
		'about.security_wallet.title': 'Bitcoin Wallet Security',
		'about.security_wallet.description':
			'BitTasker provides an integrated wallet designed for platform transactions. This wallet is intended for active use rather than long-term storage of significant Bitcoin amounts.',
		'about.security_wallet.point_1': 'Withdrawal capabilities maintained for user control',
		'about.security_wallet.point_2': 'No imposed withdrawal limitations under normal operation',
		'about.security_wallet.point_3': 'Transaction signing occurs on your device',
		'about.security_wallet.point_4': 'Designed for convenience in platform transactions',
		'about.security_wallet.alert_title': 'Security Recommendation',
		'about.security_wallet.alert_text':
			'As with any hot wallet, we recommend transferring larger Bitcoin amounts to cold storage solutions when not actively using them. Hot wallets are inherently less secure than cold storage.', // Additional Security Measures
		'about.additional_security.title': 'Additional Security Measures',

		'about.additional_security.identity_title': 'Decentralized Identity',
		'about.additional_security.identity_description':
			'BitTasker leverages the Nostr protocol for decentralized identity management. Your identity is based on cryptographic key pairs that you control, rather than being stored in a central database.',
		'about.additional_security.identity_alert':
			'Your identity can be portable across applications that support the Nostr protocol. However, the security and reliability of this system depends on the broader Nostr network and relay infrastructure.',

		'about.additional_security.escrow_title': 'Escrow System Security',
		'about.additional_security.escrow_description':
			'Our Bitcoin escrow system uses 2-of-2 multisignature technology designed to ensure that neither party can access funds unilaterally. This system aims to provide security for both taskers and taskees.',
		'about.additional_security.escrow_alert':
			'While our escrow system is designed with security in mind, users should understand that Bitcoin transactions are irreversible and dispute resolution follows predetermined timelock mechanisms.',

		'about.additional_security.privacy_title': 'Privacy-Focused Communication',
		'about.additional_security.privacy_description':
			'BitTasker implements end-to-end encryption for private messages between users, designed so that BitTasker cannot read your conversations.',
		'about.additional_security.privacy_alert':
			'Message security depends on the proper implementation of encryption protocols and the security of the devices used for communication.',
		'about.security_practices.title': 'Security Best Practices',

		'about.security_practices.alert.title': 'Your security is primarily your responsibility.',
		'about.security_practices.alert.description':
			'While BitTasker implements security measures, following these best practices is essential for protecting your account and funds. BitTasker cannot be held responsible for losses resulting from failure to follow security best practices.',

		'about.security_practices.recovery.title': 'Keep Your Recovery Information Secure',
		'about.security_practices.recovery.description':
			'Store your recovery information in a secure password manager and ensure your recovery email account is protected with strong security measures. You are solely responsible for maintaining access to your recovery information.',

		'about.security_practices.cold_storage.title': 'Use Cold Storage for Large Bitcoin Holdings',
		'about.security_practices.cold_storage.description':
			"While BitTasker's wallet implements security measures for platform transactions, we strongly recommend transferring larger Bitcoin amounts to hardware wallets or other cold storage solutions when not actively using them. Hot wallets are inherently less secure than cold storage.",

		'about.security_practices.transaction_verification.title':
			'Verify Transaction Details Carefully',
		'about.security_practices.transaction_verification.description':
			'Always double-check Bitcoin addresses and transaction amounts before confirming. Bitcoin transactions are irreversible, and BitTasker cannot recover funds sent to incorrect addresses or reverse confirmed transactions.',

		'about.security_practices.device_security.title': 'Keep Your Devices Secure',
		'about.security_practices.device_security.description':
			'Since BitTasker relies on client-side security, keeping your devices free from malware and updated with the latest security patches is essential. Use reputable antivirus software and avoid accessing your account from public or compromised devices.',
		'about.security_commitment.title': 'Our Security Commitment',
		'about.security_commitment.description':
			'BitTasker is committed to implementing and maintaining reasonable security practices as technology evolves. However, we cannot guarantee absolute security and users must take responsibility for their own security practices.',
		'about.security_commitment.warning_title': 'Security Limitations:',
		'about.security_commitment.warning_text':
			'No security system is perfect. BitTasker disclaims liability for security breaches caused by factors beyond our reasonable control, including but not limited to user negligence, third-party vulnerabilities, or sophisticated attacks.',
		'about.security_commitment.question_title': 'Have a security question?',
		'about.security_commitment.question_description':
			"We're here to help with security concerns and questions about our platform.",
		'about.security_commitment.contact': 'Get in touch'
	},
	es: {
		'about.security.title': 'Seguridad Primero',
		'about.security.description':
			'Cómo protegemos tu cuenta, cuidamos tus datos y mantenemos seguros tanto a quienes publican tareas como a quienes las realizan en nuestra plataforma.',
		'about.security_approach.title': 'Nuestro Enfoque de Seguridad',
		'about.security_approach.description':
			'BitTasker adopta un enfoque fundamentalmente diferente en materia de seguridad en comparación con las plataformas tradicionales. En lugar de pedirte que confíes en nosotros con tu información sensible, hemos construido sistemas en los que tú mantienes el control de tu propia seguridad.',
		'about.security_approach.alert_title': 'Aviso de Seguridad Importante',
		'about.security_approach.alert_text':
			'Aunque implementamos medidas de seguridad estándar en la industria, ningún sistema es completamente inmune a los riesgos de seguridad. Los usuarios son responsables de seguir las mejores prácticas de seguridad y de mantener protegidos sus dispositivos y cuentas. BitTasker no puede garantizar una seguridad absoluta y no se hace responsable de brechas de seguridad resultantes de la negligencia del usuario o de vulnerabilidades de terceros.',
		'about.security_passkeys.title': 'Llaves de acceso, no contraseñas',
		'about.security_passkeys.description':
			'Hemos implementado autenticación con llaves de acceso, que proporciona mayor seguridad en comparación con las contraseñas tradicionales. Estas llaves utilizan criptografía de clave pública para generar credenciales únicas que permanecen en tu dispositivo.',
		'about.security_passkeys.point_1': 'Diseñado para resistir ataques basados en contraseñas',
		'about.security_passkeys.point_2':
			'No se almacenan secretos compartidos en nuestros servidores',
		'about.security_passkeys.point_3': 'Verificación biométrica en dispositivos compatibles',
		'about.security_passkeys.point_4': 'Cumplimiento con el estándar FIDO2 donde esté disponible',
		'about.security_passkeys.alert_title': 'Responsabilidad del Usuario',
		'about.security_passkeys.alert_text':
			'La seguridad de las llaves de acceso depende de la seguridad de tu dispositivo. Mantén tu dispositivo actualizado y protegido para asegurar la efectividad de este método de autenticación.', // Account Recovery
		'about.security_recovery.title': 'Sistema de Recuperación de Cuenta',
		'about.security_recovery.description':
			'Ofrecemos opciones de recuperación por correo electrónico en casos donde las llaves de acceso se vuelvan inaccesibles. Nuestro sistema está diseñado para equilibrar seguridad y accesibilidad.',
		'about.security_recovery.point_1':
			'Verificación por correo electrónico con autenticación de recuperación',
		'about.security_recovery.point_2': 'Autenticación multifactor durante la recuperación',
		'about.security_recovery.point_3': 'Procesos de recuperación con tiempo limitado',
		'about.security_recovery.point_4':
			'Monitoreo de seguridad durante los intentos de recuperación',
		'about.security_recovery.alert_title': 'Responsabilidad del usuario',
		'about.security_recovery.alert_text':
			'La seguridad de la recuperación de cuenta depende de la seguridad de tu correo electrónico. Usa contraseñas seguras y activa la autenticación de dos factores en tu cuenta de recuperación.',

		// Client-Side Encryption
		'about.security_encryption.title': 'Encriptación del lado del cliente',
		'about.security_encryption.description':
			'Tu billetera de Bitcoin y las claves privadas de Nostr se encriptan en tu dispositivo usando tus credenciales antes de sincronizarse con nuestros servidores.',
		'about.security_encryption.point_1': 'Las claves se almacenan en formato encriptado',
		'about.security_encryption.point_2': 'BitTasker no tiene acceso a tus claves privadas',
		'about.security_encryption.point_3': 'La encriptación ocurre en tu dispositivo',
		'about.security_encryption.point_4': 'Protocolos de encriptación estándar de la industria',
		'about.security_encryption.alert_title': 'Responsabilidad del usuario',
		'about.security_encryption.alert_text':
			'Si pierdes acceso a tus credenciales de autenticación, no podremos recuperar tus claves encriptadas. Mantén copias de seguridad seguras de tu información de recuperación.',

		// Bitcoin Wallet Security
		'about.security_wallet.title': 'Seguridad de la Billetera Bitcoin',
		'about.security_wallet.description':
			'BitTasker ofrece una billetera integrada diseñada para transacciones dentro de la plataforma. Esta billetera está pensada para uso activo y no para almacenar grandes cantidades a largo plazo.',
		'about.security_wallet.point_1': 'Capacidades de retiro disponibles para control del usuario',
		'about.security_wallet.point_2': 'Sin restricciones de retiro bajo operación normal',
		'about.security_wallet.point_3': 'Las transacciones se firman en tu dispositivo',
		'about.security_wallet.point_4':
			'Diseñada para conveniencia en transacciones dentro de la plataforma',
		'about.security_wallet.alert_title': 'Recomendación de seguridad',
		'about.security_wallet.alert_text':
			'Como cualquier billetera caliente, recomendamos transferir grandes cantidades de Bitcoin a soluciones de almacenamiento en frío cuando no las estés usando activamente. Las billeteras calientes son menos seguras que el almacenamiento en frío.', // Medidas de seguridad adicionales
		'about.additional_security.title': 'Medidas de Seguridad Adicionales',

		'about.additional_security.identity_title': 'Identidad Descentralizada',
		'about.additional_security.identity_description':
			'BitTasker utiliza el protocolo Nostr para la gestión descentralizada de identidades. Tu identidad se basa en pares de claves criptográficas que tú controlas, en lugar de almacenarse en una base de datos centralizada.',
		'about.additional_security.identity_alert':
			'Tu identidad puede ser portátil entre aplicaciones que admiten el protocolo Nostr. Sin embargo, la seguridad y confiabilidad de este sistema dependen de la infraestructura de red y relés de Nostr.',

		'about.additional_security.escrow_title': 'Seguridad del Sistema de Depósito en Garantía',
		'about.additional_security.escrow_description':
			'Nuestro sistema de depósito en garantía de Bitcoin utiliza tecnología multisig 2-de-2 diseñada para asegurar que ninguna de las partes pueda acceder a los fondos de forma unilateral. Este sistema busca brindar seguridad tanto a quienes publican tareas como a quienes las realizan.',
		'about.additional_security.escrow_alert':
			'Aunque nuestro sistema de garantía está diseñado pensando en la seguridad, los usuarios deben entender que las transacciones con Bitcoin son irreversibles y la resolución de disputas sigue mecanismos predefinidos con límite de tiempo.',

		'about.additional_security.privacy_title': 'Comunicación Enfocada en la Privacidad',
		'about.additional_security.privacy_description':
			'BitTasker implementa encriptación de extremo a extremo en los mensajes privados entre usuarios, diseñada para que BitTasker no pueda leer tus conversaciones.',
		'about.additional_security.privacy_alert':
			'La seguridad de los mensajes depende de la correcta implementación de los protocolos de encriptación y de la seguridad de los dispositivos utilizados para la comunicación.',
		'about.security_practices.title': 'Mejores Prácticas de Seguridad',

		'about.security_practices.alert.title': 'Tu seguridad es principalmente tu responsabilidad.',
		'about.security_practices.alert.description':
			'Aunque BitTasker implementa medidas de seguridad, seguir estas mejores prácticas es esencial para proteger tu cuenta y tus fondos. BitTasker no se hace responsable por pérdidas resultantes del incumplimiento de estas prácticas.',

		'about.security_practices.recovery.title': 'Mantén Segura Tu Información de Recuperación',
		'about.security_practices.recovery.description':
			'Guarda tu información de recuperación en un gestor de contraseñas seguro y asegúrate de que tu correo electrónico de recuperación esté protegido con medidas sólidas de seguridad. Eres el único responsable de mantener el acceso a tu información de recuperación.',

		'about.security_practices.cold_storage.title':
			'Usa Almacenamiento en Frío para Grandes Cantidades de Bitcoin',
		'about.security_practices.cold_storage.description':
			'Aunque la wallet de BitTasker incluye medidas de seguridad para transacciones dentro de la plataforma, recomendamos encarecidamente transferir grandes cantidades de Bitcoin a billeteras físicas o soluciones de almacenamiento en frío. Las hot wallets son inherentemente menos seguras.',

		'about.security_practices.transaction_verification.title':
			'Verifica Cuidadosamente los Detalles de la Transacción',
		'about.security_practices.transaction_verification.description':
			'Verifica siempre las direcciones de Bitcoin y los montos antes de confirmar. Las transacciones con Bitcoin son irreversibles y BitTasker no puede recuperar fondos enviados a direcciones incorrectas ni revertir transacciones confirmadas.',

		'about.security_practices.device_security.title': 'Mantén Tus Dispositivos Seguros',
		'about.security_practices.device_security.description':
			'Dado que BitTasker depende de la seguridad del lado del cliente, es esencial mantener tus dispositivos libres de malware y actualizados con los últimos parches de seguridad. Usa software antivirus confiable y evita acceder a tu cuenta desde dispositivos públicos o comprometidos.',
		'about.security_commitment.title': 'Nuestro Compromiso con la Seguridad',
		'about.security_commitment.description':
			'BitTasker se compromete a implementar y mantener prácticas de seguridad razonables a medida que la tecnología evoluciona. Sin embargo, no podemos garantizar una seguridad absoluta y los usuarios deben asumir la responsabilidad de sus propias prácticas de seguridad.',
		'about.security_commitment.warning_title': 'Limitaciones de Seguridad:',
		'about.security_commitment.warning_text':
			'Ningún sistema de seguridad es perfecto. BitTasker no se hace responsable de violaciones de seguridad causadas por factores fuera de nuestro control razonable, incluyendo, entre otros, negligencia del usuario, vulnerabilidades de terceros o ataques sofisticados.',
		'about.security_commitment.question_title': '¿Tienes una pregunta sobre seguridad?',
		'about.security_commitment.question_description':
			'Estamos aquí para ayudarte con preocupaciones y dudas relacionadas con la seguridad en nuestra plataforma.',
		'about.security_commitment.contact': 'Contáctanos'
	}
};
