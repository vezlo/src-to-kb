import 'package:equatable/equatable.dart';
import 'package:json_annotation/json_annotation.dart';

part 'order_model.g.dart';

enum OrderStatus { pending, confirmed, shipped, cancelled }

@JsonSerializable()
class OrderModel extends Equatable {
  const OrderModel({
    required this.id,
    required this.title,
    required this.status,
    required this.items,
    this.createdAt,
  });

  factory OrderModel.fromJson(Map<String, dynamic> json) =>
      _$OrderModelFromJson(json);

  final String id;
  final String title;
  final OrderStatus status;
  final List<OrderItem> items;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => _$OrderModelToJson(this);

  OrderModel copyWith({
    String? id,
    String? title,
    OrderStatus? status,
    List<OrderItem>? items,
    DateTime? createdAt,
  }) {
    return OrderModel(
      id: id ?? this.id,
      title: title ?? this.title,
      status: status ?? this.status,
      items: items ?? this.items,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  List<Object?> get props => [id, title, status, items, createdAt];
}

@JsonSerializable()
class OrderItem extends Equatable {
  const OrderItem({required this.name, required this.quantity, required this.price});

  factory OrderItem.fromJson(Map<String, dynamic> json) =>
      _$OrderItemFromJson(json);

  final String name;
  final int quantity;
  final double price;

  double get subtotal => quantity * price;

  Map<String, dynamic> toJson() => _$OrderItemToJson(this);

  @override
  List<Object?> get props => [name, quantity, price];
}
