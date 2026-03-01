import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../models/order_model.dart';
import '../repositories/order_repository.dart';

// Events
sealed class OrderEvent extends Equatable {
  const OrderEvent();
  @override
  List<Object?> get props => [];
}

class LoadOrders extends OrderEvent {
  const LoadOrders();
}

class CreateOrder extends OrderEvent {
  const CreateOrder({required this.title, required this.items});
  final String title;
  final List<String> items;

  @override
  List<Object?> get props => [title, items];
}

// States
sealed class OrderState extends Equatable {
  const OrderState();
  @override
  List<Object?> get props => [];
}

class OrderInitial extends OrderState {}
class OrderLoading extends OrderState {}

class OrderLoaded extends OrderState {
  const OrderLoaded(this.orders);
  final List<OrderModel> orders;

  @override
  List<Object?> get props => [orders];
}

class OrderError extends OrderState {
  const OrderError(this.message);
  final String message;

  @override
  List<Object?> get props => [message];
}

// Bloc
class OrderBloc extends Bloc<OrderEvent, OrderState> {
  OrderBloc({required this.repository}) : super(OrderInitial()) {
    on<LoadOrders>(_onLoadOrders);
    on<CreateOrder>(_onCreateOrder);
  }

  final OrderRepository repository;

  Future<void> _onLoadOrders(LoadOrders event, Emitter<OrderState> emit) async {
    emit(OrderLoading());
    try {
      final orders = await repository.findAll();
      emit(OrderLoaded(orders));
    } catch (e) {
      emit(OrderError(e.toString()));
    }
  }

  Future<void> _onCreateOrder(CreateOrder event, Emitter<OrderState> emit) async {
    emit(OrderLoading());
    try {
      await repository.create(title: event.title, items: event.items);
      final orders = await repository.findAll();
      emit(OrderLoaded(orders));
    } catch (e) {
      emit(OrderError(e.toString()));
    }
  }
}
