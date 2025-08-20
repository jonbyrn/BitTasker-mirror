// Configurar la página para que no se prerenderice
export const prerender = false;

// O si quieres que se prerenderice, especifica los taskIds conocidos
// export const prerender = true;
// export const entries = async () => {
//   // Retorna un array de taskIds conocidos para prerenderizar
//   // Por ejemplo: ['task1', 'task2', 'task3']
//   return [];
// };