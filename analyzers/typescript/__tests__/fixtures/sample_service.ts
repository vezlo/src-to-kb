import { Injectable } from '@nestjs/common';
import type { CreateOrderDto } from '../dto/create-order.dto';
import { Order } from '../models/order';
import { OrderRepository } from '../repositories/order.repository';

export interface OrderFilter {
  status?: OrderStatus;
  userId?: string;
  fromDate?: Date;
}

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'cancelled';

export enum Priority {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

@Injectable()
export class OrderService {
  constructor(private readonly repo: OrderRepository) {}

  async create(data: CreateOrderDto): Promise<Order> {
    const order = this.repo.create(data);
    return this.repo.save(order);
  }

  async findById(id: string): Promise<Order | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findAll(filter: OrderFilter): Promise<Order[]> {
    return this.repo.find({ where: filter });
  }

  private validate(data: CreateOrderDto): boolean {
    return data.items.length > 0 && data.userId != null;
  }

  protected async notifyWarehouse(order: Order): Promise<void> {
    // notification logic
  }
}
