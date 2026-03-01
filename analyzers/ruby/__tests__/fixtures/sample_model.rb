class Order < ApplicationRecord
  belongs_to :user
  has_many :line_items, dependent: :destroy
  has_one :invoice, class_name: 'OrderInvoice'

  validates :status, presence: true
  validates :total, numericality: { greater_than: 0 }

  scope :pending, -> { where(status: :pending) }
  scope :recent, -> { where('created_at > ?', 1.week.ago) }

  enum status: { pending: 0, confirmed: 1, shipped: 2, cancelled: 3 }

  before_save :calculate_total
  after_create :notify_warehouse

  def confirm!
    update!(status: :confirmed)
  end

  def total_with_tax(rate = 0.1)
    total * (1 + rate)
  end

  private

  def calculate_total
    self.total = line_items.sum(&:subtotal)
  end

  def notify_warehouse
    WarehouseNotifier.deliver(self)
  end
end
