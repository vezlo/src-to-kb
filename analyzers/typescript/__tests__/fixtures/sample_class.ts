import { EventEmitter } from 'events';

export abstract class BaseEntity {
  readonly id: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(id: string) {
    this.id = id;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  abstract validate(): boolean;

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}

export class Order extends BaseEntity {
  status: OrderStatus = 'pending';
  private items: OrderItem[] = [];

  constructor(id: string, public readonly userId: string) {
    super(id);
  }

  validate(): boolean {
    return this.items.length > 0;
  }

  addItem(item: OrderItem): void {
    this.items.push(item);
    this.updatedAt = new Date();
  }

  get total(): number {
    return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  static create(userId: string): Order {
    const id = Math.random().toString(36).slice(2);
    return new Order(id, userId);
  }
}

type OrderStatus = 'pending' | 'confirmed' | 'shipped';

interface OrderItem {
  name: string;
  price: number;
  quantity: number;
}
