import { Order } from '../models/order';

export interface Repository<T> {
  findOne(options: { where: Partial<T> }): Promise<T | null>;
  find(options: { where: Partial<T> }): Promise<T[]>;
  create(data: Partial<T>): T;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}

export interface OrderRepository extends Repository<Order> {
  findByStatus(status: string): Promise<Order[]>;
  findByUser(userId: string): Promise<Order[]>;
  countByStatus(): Promise<Record<string, number>>;
}
