module Searchable
  extend ActiveSupport::Concern

  included do
    scope :search, ->(query) { where('name LIKE ?', "%#{query}%") }
  end

  class_methods do
    def searchable_fields
      [:name, :description]
    end
  end

  def matching_score(query)
    # Calculate relevance score
    0.0
  end
end
