import type { Task, GetTasksParams, TaskResponse, SearchTasksParams, TaskStatus } from '$lib/types/task.d';
import createAxiosInstance from '$lib/api/axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_PATH = '/api/v1/tasks';

const taskApi = createAxiosInstance({ baseURL: API_URL });

export async function createTask(task: Partial<Task>): Promise<Task> {
    const { data } = await taskApi.post(`${API_PATH}`, task);
    return data;
}

export async function getAllTasks(params: GetTasksParams = {}): Promise<TaskResponse> {
    const { data } = await taskApi.get(`${API_PATH}`, { params });
    return data;
}

export async function getMyTasks(): Promise<Task[]> {
    const { data } = await taskApi.get(`${API_PATH}/my-tasks`);
    return data;
}

export async function getTaskById(id: string): Promise<Task> {
    const { data } = await taskApi.get(`${API_PATH}/${id}`);
    return data;
}

export async function updateTask(id: string, task: Partial<Task>): Promise<Task> {
    const { data } = await taskApi.put(`${API_PATH}/${id}`, task);
    return data;
}

export async function deleteTask(id: string): Promise<void> {
    await taskApi.delete(`${API_PATH}/${id}`);
}

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
    const { data } = await taskApi.put(`${API_PATH}/${id}/status`, { status });
    return data;
}

export async function searchTasks(params: SearchTasksParams = {}): Promise<TaskResponse> {
    const { data } = await taskApi.get('/api/v1/tasks/search', { params });
    return data;
}