import 'dart:async';
import '../models/order_model.dart';

abstract class OrderRepository {
  Future<List<OrderModel>> findAll();
  Future<OrderModel?> findById(String id);
  Future<OrderModel> create({required String title, required List<String> items});
  Future<void> delete(String id);
}

class OrderRepositoryImpl implements OrderRepository {
  OrderRepositoryImpl({required this.apiClient});

  final ApiClient apiClient;
  final List<OrderModel> _cache = [];

  @override
  Future<List<OrderModel>> findAll() async {
    final response = await apiClient.get('/orders');
    final orders = (response as List).map((e) => OrderModel.fromJson(e)).toList();
    _cache
      ..clear()
      ..addAll(orders);
    return orders;
  }

  @override
  Future<OrderModel?> findById(String id) async {
    return _cache.where((o) => o.id == id).firstOrNull;
  }

  @override
  Future<OrderModel> create({required String title, required List<String> items}) async {
    final response = await apiClient.post('/orders', body: {
      'title': title,
      'items': items,
    });
    return OrderModel.fromJson(response);
  }

  @override
  Future<void> delete(String id) async {
    await apiClient.delete('/orders/$id');
    _cache.removeWhere((o) => o.id == id);
  }
}
