Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      resources :orders, only: [:index, :show, :create] do
        member do
          post :confirm
        end
        collection do
          get :pending
        end
      end

      resources :users, only: [:show, :update]

      resource :profile, only: [:show, :update]
    end
  end

  get '/health', to: 'health#check'
end
